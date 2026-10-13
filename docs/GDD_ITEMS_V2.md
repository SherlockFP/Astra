# EFSUN ONLINE – Kadim Zindanlar · GDD: Items V2 ("Basma, Efsun, Parıltı, Kamp ve Ev")

Design addendum for the **item-power loop**: glowing gear on the character, deeper upgrading (basma), deeper bonus enchanting (efsun), the systems we borrow from other MMOs / ARPGs, and the later camping + housing phase. Written 2026-10-13 for the ROADMAP batch-4 request ("bastıkça itemlerin parlaması, çelik zırh", "daha fazla efsun + basma", "başka MMO/aksiyon RPG'lerden çal", "kamp sistemi, ev satın alma"). **Docs only: no code was changed.** Implementation is done by Haiku agents from §7 in waves of ≤ 3 file-disjoint packages.

Precedence: `ARCHITECTURE.md` > `src/types/*` and stub signatures > this document > `GDD_V2.md` / `GDD_LIFE.md` > `GDD_SYSTEMS.md` where they disagree **and this document says so in §0.3**. Player-facing text is Turkish; ids, code and comments are English.

## Table of contents

0. Conventions, decisions at a glance, overrides, new ids, priorities
1. Upgrade visuals for all gear (armor shader, particles, set aura, replication)
2. Deeper basma: Talih Birikimi (failstacks), Değerli Taş, Yükseltme Kâğıtları, break rules, pity, Ustalık, ceremony, announcements
3. Deeper efsun: one engine / two layers, slots 6 and 7, Tezgâh, Özel Efsun, item catalogue, orb reconciliation
4. Borrowed systems and the item-power pyramid (Kalite & Mühür, Tılsım, Kazıma, Ejderha Taşları, budgets)
5. Camping and housing (later phase, P3)
6. UI changes (blacksmith redesign, efsun tab, tooltips, badges)
7. IMPLEMENTATION PLAN (Haiku packages, waves, file ownership)
A. Appendix: type and data sketches

---

## 0. Conventions, decisions at a glance, overrides, new ids, priorities

### 0.1 Code facts this document builds on (verified in the repo on 2026-10-13)

| Fact | Where | Consequence |
|---|---|---|
| Weapon glow = inflated fresnel **shell meshes** added as children of rigid weapon meshes; skinned meshes are skipped (`!isSkinnedMesh`); tiers +7/+9/+12/+15 | `src/vfx/WeaponGlow.ts` (`WeaponGlows.set(root, upgrade)`), `shellMaterial()` in `src/vfx/Meshes.ts`, API `G.vfx.weaponGlow(root, upgrade)` | Armor cannot use shells (the body meshes are skinned, a shell would double the skinned draw calls and cannot be masked). Armor uses an **in-material shader patch** (§1.3) |
| Every GLB is auto-patched by `patchPSX(material)` (vertex snap + affine UV, `customProgramCacheKey` gets the suffix `psx1SA` appended); `Material.clone()` drops `onBeforeCompile`, `Assets.cloneMaterials()` re-applies only the PSX patch | `src/render/psx/PSXMaterial.ts`, `src/core/Assets.ts` | The armor patch must **chain after** the PSX patch and be re-applied after every clone (§1.3.6) |
| KayKit adventurers: skinned meshes `<C>_Body`, `<C>_ArmLeft`, `<C>_ArmRight`, `<C>_LegLeft`, `<C>_LegRight`, `<C>_Head`; rigid accessories `Knight_Helmet` / `Barbarian_Hat` / `Mage_Hat`, `<C>_Cape`; one 1024² flat-swatch palette texture per GLB; 41-bone rig shared by all 9 KayKit files | `docs/assets/characters.md` §0–1, verified with `node tools/glb-inspect.mjs` | One shader + mask pipeline serves 4 GLBs = all 9 classes (GDD_CLASSES_V2 reuses the same GLBs) |
| `CharacterModel` applies palette variants by recolouring the palette in a canvas (`recolorTexture`, HSV tests: `s < 0.16` steel/white/black, hue 8–40 skin/leather, hue 41–66 gold trim) and keeps `baseOf` (recoloured → original texture) | `src/entities/CharacterModel.ts` | The armor **mask texture** is derived from the original palette with the same HSV tests, so variants never matter |
| `Player.VISIBLE_SLOTS = ['weapon','offhand','helm']` and `Replication.VISIBLE_SLOTS` (same list) are the only slots that cross the net in the `gear` channel; items are stripped by `compactItem` (keeps `upgrade`, `setId`, `uniqueId`, `sockets`) | `src/entities/Player.ts:27`, `src/net/Replication.ts:49,594` | Extending both lists to the six armor slots is the whole net change for remote armor glow |
| Upgrade pipeline: `upgradeCost`, `rollUpgradeOutcome`, `upgradeItem` (Metin2 table in `data/upgrades.ts`), per-**item** `failStacks` (+2 pp per failed attempt ≥ +10, max +20 pp), `kutsama_kagidi`, `demirci_el_kitabi` (+10 pp) | `src/systems/Upgrade.ts`, `src/data/upgrades.ts` | §2 replaces the per-item pity with a per-**character** one |
| Affix engine: `item.affixes: RolledAffix[]`, `rerollAffixes`, `rerollAffixValues`, `addRandomAffix`, `rollMoreAffixes`, `efsunBoost(item)` (+N → +5…+20% on random affix values), 50 affix defs in 6 tiers T5…T0 | `src/systems/ItemGen.ts`, `src/data/affixes.ts` | §3 keeps this engine and adds two **separate** slot fields so existing reroll code is untouched |
| Blacksmith panel: tabs `up / efsun / socket / salvage`, anvil stage with `ForgeFx` (sparks, embers, smoke, shards, ring, glints), banner, hammer element, toggles for Kutsama and El Kitabı | `src/ui/panels/items/BlacksmithPanel.ts` (1049 lines), `ForgeFx.ts` | §6 splits the file into per-tab modules first (IT-30) so later packages are file-disjoint |
| NPCs: Demirci Haldun Usta (`npc_demirci`, panel `blacksmith`), Efsuncu Nergis (`npc_efsuncu`, panel `blacksmith`, tab `efsun`) | `src/data/town.ts`, GDD_CONTENT §2 | Ceremony reactions (`Cheer` on success, `Hit_B` on failure) already exist in the NPC brief |

### 0.2 Decisions at a glance

| # | Decision | Section |
|---|---|---|
| D1 | Armor glow is a **fragment-shader patch** on the existing skinned materials (fresnel + emissive mask + runes/flames/prism), masked by a **palette-derived mask texture** and **per-vertex slot ids** from bone weights. No new meshes, no extra draw calls | §1.3 |
| D2 | Per-slot look = that piece's own `+N`; body aura (particles, light) = **weighted average** of the six armor slots (chest ×2). Tiers: +4 Çelik Cila, +7 Mavi Titreşim, +9 Mor Rünler, +12 Kızıl-Altın Alev, +15 Prizma | §1.1 |
| D3 | Set completion adds a ground sigil + shoulder motes + a periodic silhouette pulse in the set colour | §1.5 |
| D4 | The Metin2 table (+0…+15, gold, materials) is **unchanged**. New layers on top: **Talih Birikimi** (BDO failstacks, per character, soft + hard pity), **Değerli Taş** (store/sell stacks), **Yükseltme Kâğıtları** (KO scroll tiers), **break rules** (unbound items are destroyed, bound items become *Kırık* and are repairable), **Demirci Acıması** (streak guard), **Ustalık** (D4 masterworking, the only post-+15 progression) | §2 |
| D5 | **One affix engine, two currency layers, one verb = one item.** Layer A (Demirci Efsunu: gold + efsun items, bulk and safe) and Layer B (Zanaat Küreleri: orbs, surgical and gambling) share the same slot rules, locks and panel widget. GDD_V2's `orb_*` stay; the efsun items keep their ids | §3.1 |
| D6 | Slots 6 and 7 are **separate fields** (`item.bench`, `item.special`): 6 = **Tezgâh Efsunu** (PoE bench: deterministic, chosen), 7 = **Özel Efsun** (Metin2 special bonus: random from a niche pool). Both unlocked by rare cores | §3.2 |
| D7 | Borrowed systems each get exactly one lane: Silkroad seals + Lost Ark quality → **Kalite & Mühür** (derived, zero power); Aion godstone → **Tılsım Yuvası**; Lost Ark engravings → **Kazıma** (jewellery only); D4 masterwork → **Ustalık**; PoE bench → **Tezgâh**; KO plus colours → **+N badge colours**; Metin2 dragon stones → **Ejderha Taşları** (character layer, P3) | §4 |
| D8 | Camping = a placeable **Kamp** (tent + fire + cookfire) in the open world: rest, cooking, respawn, 15–30 min. Housing = **one house per character** (3 tiers), interior is a `DungeonDef` scene, party-visitable through the host's scene change, stash/stations work locally for every visitor | §5 |
| D9 | Every chase layer is capped by a **power budget** (BP per layer, §4.7) so that the item pyramid cannot outgrow the M+ HP curve (V2 §11.1) | §4.7 |

### 0.3 Override list (this document changes an existing rule; the code owner updates)

| # | Existing rule | New rule | Owner |
|---|---|---|---|
| O-IT1 | GDD_V2 §4.3 `orb_corrupt` outcome "upgrade ceiling +1 (max +16)" | Replaced by **"+1 Ustalık rank"** (stored on the item, applies once the item is +15; cap rank 5). There is no +16 | items |
| O-IT2 | GDD_V2 §4.3 renames `kadim_efsun` to "İlahi Küre" | UI name is **Efsun Güçlendirme Nesnesi** (id `kadim_efsun` unchanged). "İlahi Küre" is dropped | items, panels-items |
| O-IT3 | `demirci_el_kitabi` "Demircinin El Kitabı" (+10 pp) | Same id and same +10 pp, UI name becomes **Orta Yükseltme Kâğıdı**; two siblings are added (§2.5). Old saves keep working | items |
| O-IT4 | GDD_SYSTEMS §5.2 "Demircinin Hatırası": per-item `failStacks`, +2 pp, max +20 pp | **Removed.** Replaced by the character-wide **Talih Birikimi** (§2.3). `ItemInstance.failStacks` stays in the type (deprecated, ignored on read, deleted on the next upgrade of that item) | items |
| O-IT5 | GDD_SYSTEMS §5.1/§5.2 failure ≥ +10 = item destroyed (only Kutsama saves it) | Unbound items are still destroyed; **bound items (Efsanevi / Set / Tier / named unique) become Kırık** instead (repairable, §2.6). Scrolls soften failures (§2.5) | items |
| O-IT6 | `efsun_nesnesi` rerolls "all random affixes" | Rerolls **slots 1–5** only. Slots 6 and 7 have their own tools (§3.2) | items |
| O-IT7 | GDD_SYSTEMS §4.1 "armour tier is shown as a material tint (T1 none, T2 steel-blue …)" | Not implemented today; **upgrade glow replaces it** as the primary armor visual. The base-tier tint survives as an optional P2 uniform on the same shader (§1.9) | vfx-audio |
| O-IT8 | GDD_LIFE §6.4 `UPGRADE_ILVL` only | `itemIlvlEquiv = itemLevel + UPGRADE_ILVL[up] + MW_ILVL[mw]` with `MW_ILVL = [0,1,2,3,5,7]` (§2.8) | items |
| O-IT9 | `ChatLink` snapshot sanitizer (GDD_LIFE §3.5): ≤ 6 affixes, `upgrade` 0–15 | ≤ 5 `affixes` **plus** optional `bench` / `special` lines, `mw` 0–5, `tilsim` id; value clamps use the S-tier maxima | net, hud |

### 0.4 New ids (all append-only; full list in Appendix A)

| Kind | Ids |
|---|---|
| Materials (pouch) | `yukseltme_dusuk`, `yukseltme_yuksek`, `degerli_tas_10/20/30/40/50`, `efsun_cekirdegi_6`, `efsun_cekirdegi_7`, `kader_zari`, `efsun_aktarma` (P3), `kamp_takimi`, `kamp_odunu`, `ev_tasi`; Tılsım stones `tilsim_<type>_<grade>` (P2); Ejderha stones `ds_<color>_<grade>` (P3). Existing ids reused: `kutsama_kagidi`, `demirci_el_kitabi`, `efsun_nesnesi`, `efsun_kilidi`, `kadim_efsun`, `takviye_nesnesi`, `oyma_kalemi`, `ancient_dust`, `orb_*` |
| Item fields | `ItemInstance.bench`, `.special`, `.mw`, `.tilsim`, `.broken`; `RolledAffix.s` (S-tier); `CharacterSave.upg`, `.home`, `.camp` |
| Settings | `armorGlow: 'off' \| 'low' \| 'high'` (default `'high'`), `fastForge: boolean` (default `false`) |
| Events | `upgrade:attempt`, `upgrade:announce`, `efsun:changed`, `camp:placed`, `camp:expired`, `home:entered`, `home:left` |
| Net | `chat.ann?` (announcement), channels `camp`, `home` (P3) |
| VFX ids | `set_aura`, `forge_announce`, `forge_announce_rainbow`, `camp_light`, `camp_smoke` |
| SFX ids | `forge_strike`, `forge_heartbeat`, `forge_ding`, `forge_crack`, `forge_shatter`, `camp_crackle`, `ann_chime` (all mapped to existing sample files, §7 IT-10) |
| Panels | `home` (P3); `blacksmith` data `{ tab?: 'up'\|'efsun'\|'craft'\|'socket'\|'salvage', uid? }` (tab `craft` = V2 "Zanaat") |

### 0.5 Priorities

| P | What ships | Sections |
|---|---|---|
| **P0** | +N colour badges, upgrade **armor glow** (shader; its particles and set aura ship in the same package IT-10 and are switchable with the `armorGlow` setting), Talih Birikimi, Yükseltme Kâğıtları, break rules, announcements, blacksmith panel split + redesign of the Yükselt tab | §1.1–1.3, §1.7, §2, §4.3, §6.1 |
| **P1** | Efsun slots 6/7 (Tezgâh + Özel), Efsun items catalogue, Kalite & Mühür, Değerli Taş shop, **Ustalık**, ceremony polish | §2.8, §3, §4.2 |
| **P2** | Tılsım, Kazıma, base-tier tint, Efsun Aktarma | §4.4–4.5, §1.9, §3.10 |
| **P3** | Ejderha Taşları, Kamp, Ev | §4.6, §5 |

---

## 1. Upgrade visuals for all gear

### 1.1 Visual tiers (one table for weapons, shields and armor)

Tier names and thresholds are shared with the `+N` badge colours (§4.3) and the tooltip glow line, so the same word means the same thing everywhere. Data lives in `src/data/itemVisuals.ts` as `UPGRADE_TIERS`.

| Tier id | `+N` | TR name | Armor look (fragment shader, §1.3) | Weapon / shield look (shell, `WeaponGlow.ts`) | Body particles (§1.4) |
|---|---|---|---|---|---|
| `none` | 0–3 | – | – | – | – |
| `steel` | **4**–6 | Çelik Cila | cool-white fresnel on **metal and trim** swatches (power 2.6, amp 0.30) + a slow diagonal specular **sweep** every 3.2 s | **NEW** faint white shell: `{ level: 4, color 0xdde8ff, power 3.2, inflate 0.015, alpha 0.35, pulse 0.2, base 0.03 }`, no particles | – |
| `blue` | 7–8 | Mavi Titreşim | + blue `#3fa9ff` fresnel that pulses with a 1.4 s period (amp 0.45 on metal/trim, ×0.45 on cloth) | existing `+7` shell | – |
| `purple` | 9–11 | Mor Rünler | + `#b14cff` **voxel runes**: a 3-D hash grid (cell ≈ 0.07 m in bind space) flickers at 2 Hz on metal, trim and half-strength on cloth | existing `+9` shell + motes | 6 motes/s |
| `flame` | 12–14 | Kızıl-Altın Alev | + red→gold **flame bands** scrolling upward in bind-space Y, gold edge fresnel, emissive up to 2.0 (bloom picks it up) | existing `+12` shell + embers | 14 wisps/s |
| `prism` | **15** | Prizma | + hue-cycling rainbow fresnel and rainbow runes (4 s cycle), emissive up to 2.4 | existing `+15` rainbow | 22 sparkles/s + a tiny point light (local player only) |

Rules:

* **Armor per-slot level** = that piece's own `item.upgrade` (0 for an empty slot, 0 for a `broken` item). It drives the shader for the mesh region of that slot (§1.2).
* **Body level** `L_body = floor( Σ w_s · up_s / 7 + 0.5 )` with weights `chest 2, helm 1, shoulders 1, gloves 1, legs 1, boots 1` (empty slot = 0). It drives the **particles, the light and the Character panel readout** ("Zırh Parlaklığı: Mor Rünler, ort. +9.3"). Example: chest +15 and everything else +0 → L_body 4 (steel), but the chest itself shows prism.
* **Shields** use the weapon shell (they are rigid meshes). **Belt, rings, amulet** have no body mesh: they add nothing visually, except the optional pendant (§1.6).
* Hit-flash (`G.vfx.flash`) and the status tints keep working: the armor term is **added to `totalEmissiveRadiance`**, the flash drives the material's `emissive` uniform.
* Everything renders in the low-res PSX buffer, so the PSX post pass quantises and dithers it for free.

### 1.2 What the KayKit models give us, and how a "slot" is found

KayKit adventurers cannot swap armor meshes. The body is **six skinned meshes plus two rigid accessories**. We recover the six armor slots with two tools that work together: the **node name** (coarse group, always available) and the **dominant bone per vertex** (fine split, computed once per geometry).

**Node names** (verified; `<C>` = `Knight | Barbarian | Mage | Rogue`; Rogue_Hooded uses `Rogue_Head_Hooded`, plain Rogue `Rogue_Head`). Regex: `^(Knight|Barbarian|Mage|Rogue)_(Body|ArmLeft|ArmRight|LegLeft|LegRight|Head|Head_Hooded|Helmet|Hat|Cape)$`.

| Node | Type | Coarse group → slots it can show | Notes |
|---|---|---|---|
| `<C>_Body` | skinned | `chest` (bones `spine`, `chest`); also contains the shoulder caps and the hip/tassets → fine split below | the main steel plate on Knight, leather on Rogue, robe on Mage |
| `<C>_ArmLeft`, `<C>_ArmRight` | skinned | `shoulders` (bone `upperarm.*`) + `gloves` (bones `lowerarm.*`, `hand.*`) | Knight pauldrons and gauntlets live here |
| `<C>_LegLeft`, `<C>_LegRight` | skinned | `legs` (bones `upperleg.*`, `hips`) + `boots` (bones `lowerleg.*`, `foot.*`, `toes.*`) | greaves and boots are one mesh |
| `<C>_Head`, `Rogue_Head_Hooded` | skinned | `helm` (bone `head`) | the face is skin (mask 0), the Rogue hood is cloth (mask 0.4) |
| `Knight_Helmet`, `Barbarian_Hat`, `Mage_Hat` | **rigid** (child of bone `head`) | `helm` | hidden by "Kaskı gizle"; the shader on them is the same as on skinned meshes |
| `<C>_Cape` | rigid (child of bone `chest`) | `chest` | cloth swatches only → weak colour wash, no runes |

**Per-vertex slot id (`aArmorSlot`)** — computed once per geometry by `ensureSlotAttribute(mesh)` in `src/vfx/ArmorShader.ts`:

```
slot ids: 0 helm · 1 shoulders · 2 chest · 3 gloves · 4 legs · 5 boots
skinned: for each vertex take the joint with the largest skinWeight among its 4 influences, look up the bone NAME
         (skeleton.bones[idx].name, lower-cased, '.' already stripped by GLTFLoader: 'upperarml'), map by prefix:
           ^head                      -> 0
           ^upperarm                  -> 1
           ^(spine|chest)             -> 2
           ^(lowerarm|hand|wrist)     -> 3
           ^(hips|upperleg)           -> 4
           ^(lowerleg|foot|toes)      -> 5
           anything else (root, IK/control helpers, handslot) -> 2
rigid:   constant per mesh: Helmet / Hat -> 0 ; Cape -> 2 ; unknown -> 2
write:   geometry.setAttribute('aArmorSlot', new THREE.Float32BufferAttribute(array, 1)); geometry.userData.armorSlot = true
```

The geometry is shared by every clone (`SkeletonUtils.clone` shares geometry), so the attribute is built **once per GLB per session** (≈ 6 meshes × ≤ 3 k vertices, < 5 ms). Slot borders are hard (nearest bone), which looks right in PSX. **Fallback** when a mesh has no `skinIndex`/`skinWeight` (should not happen): the slot level of the mesh is `max` of the slots in its coarse group (arm → `max(shoulders, gloves)`, leg → `max(legs, boots)`).

**Debug view:** `?armordebug=1` on `dev/vfx.html` paints the six slots in six flat colours (uniform `uArmDebug = 1`) so a human can verify the bone map once per GLB. Expected for Knight: pauldrons = slot 1, gauntlets = 3, plate = 2, thigh armor = 4, greaves/boots = 5, helmet = 0.

### 1.3 PSX-friendly shader approach (`onBeforeCompile` fresnel + emissive mask that keeps the PSX patch)

**1.3.1 Mask texture** (`buildArmorMask(baseMap: THREE.Texture): THREE.DataTexture`). One byte per texel, built **once per palette texture** (cache by `texture.uuid`), from the *original* palette (never the recoloured one). Classification per texel with the same HSV helpers as `recolorTexture`:

| Palette texel | Class | Mask value |
|---|---|---:|
| `s < 0.16` and `v ≥ 0.22` (steel, white) | metal | 255 |
| `s < 0.16` and `v < 0.22` (black straps, dark iron) | dark metal | 90 |
| hue 41–66 and `s ≥ 0.35` (gold trim) | trim | 220 |
| hue 8–40 and `s < 0.72` (skin, leather, wood) | skin / leather | 0 |
| everything else (saturated cloth: tabard, tunic, robe) | cloth | 110 |

`RedFormat` / `UnsignedByteType`, `NearestFilter`, no mipmaps, `flipY` copied from the source, 512 × 512 (nearest down-sample of the 1024² palette; check swatch alignment in the debug view, fall back to 1024 if a swatch edge bleeds). ≈ 256 KB per class, built in ≈ 15 ms. In the shader `m = texture2D(uArmMask, armUv).r`: the "steel plate" glows, skin never does, cloth gets a weaker wash.

**1.3.2 Material patch** (`attachArmorShader(root, mask)` in `src/vfx/ArmorShader.ts`). For every `Mesh` under the model root whose name matches the regex of §1.2 and whose material is a `MeshStandardMaterial`/`MeshLambertMaterial`/`MeshPhongMaterial` with `map`:

```ts
const prev = mat.onBeforeCompile;                       // already contains the PSX patch (it chains its own predecessor)
const prevKey = mat.customProgramCacheKey;
const U = { uArmMask: {value: mask}, uArmLv: {value: [0,0,0,0,0,0]}, uArmTime: {value: 0}, uArmLod: {value: 1}, uArmDebug: {value: 0}, uArmTint: {value: [...6 × Color]}, uArmSet: {value: new THREE.Vector4(0,0,0,0)} /* rgb set colour, w pulse 0..1 */ };
ARMOR_UNIFORMS.set(mat, U);                             // WeakMap<Material, ...>, NOT mat.userData (Material.clone() JSON-copies userData and would serialise the mask texture)
mat.onBeforeCompile = function (shader, renderer) {
  prev.call(this, shader, renderer);                    // PSX first
  Object.assign(shader.uniforms, U);
  shader.vertexShader = shader.vertexShader
    .replace('void main() {', ARMOR_VERT_HEAD + '\nvoid main() {')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + ARMOR_VERT_BODY);   // vArmSlot = aArmorSlot; vArmBind = position;
  shader.fragmentShader = shader.fragmentShader
    .replace('void main() {', ARMOR_FRAG_HEAD + '\nvoid main() {')
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + ARMOR_FRAG_BODY);
};
mat.customProgramCacheKey = function () { return prevKey.call(this) + '|armor' + ARMOR_SHADER_VERSION; };
mat.needsUpdate = true;
```

* The PSX patch replaces `map_fragment` inline (affine UV in a local `psxUv_vMapUv` when `PSX_AFFINE` is defined). `ARMOR_FRAG_BODY` therefore picks the UV like this: `#if defined(PSX_AFFINE) && defined(USE_MAP)  vec2 armUv = psxUv_vMapUv; #elif defined(USE_MAP)  vec2 armUv = vMapUv; #else  vec2 armUv = vec2(0.5); #endif`. The injection point `emissivemap_fragment` is after `map_fragment`, so the variable is in scope.
* `normal` (view space) and `vViewPosition` exist in Standard/Lambert/Phong fragment shaders at that point. Basic materials are skipped.
* **Uniform arrays:** `uArmLv` is `uniform float uArmLv[6]`; indexing with `int(vArmSlot + 0.5)` is legal in WebGL 2 (three r186 is WebGL 2 only).
* `aArmorSlot` is a vertex attribute, **not** a uniform: no extra draw calls, no extra textures except the 256 KB mask, no extra passes.

**1.3.3 GLSL (reference implementation; constants come from `ARMOR_LOOK` in `data/itemVisuals.ts`)**

```glsl
// ---- vertex head
attribute float aArmorSlot;
varying float vArmSlot;
varying vec3  vArmBind;
// ---- vertex body (after begin_vertex): bind-pose position, so patterns stick to the surface while limbs animate
vArmSlot = aArmorSlot;
vArmBind = position;

// ---- fragment head
uniform sampler2D uArmMask;  uniform float uArmLv[6];  uniform float uArmTime;  uniform float uArmLod;  uniform float uArmDebug;  uniform vec4 uArmSet;
varying float vArmSlot;  varying vec3 vArmBind;
vec3 armHue(float h){ vec3 k = vec3(1.0, 0.6667, 0.3333); return clamp(abs(fract(h + k) * 6.0 - 3.0) - 1.0, 0.0, 1.0); }
float armHash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }

// ---- fragment body (after emissivemap_fragment)
{
  int  si = int(vArmSlot + 0.5);
  float lv = uArmLv[si];
  if (uArmDebug > 0.5) { totalEmissiveRadiance = armHue(float(si) / 6.0) * 0.8; }
  else if (lv >= 4.0 && uArmLod > 0.001) {
    float m      = texture2D(uArmMask, armUv).r;
    float metalK = smoothstep(0.55, 0.85, m);
    float clothK = smoothstep(0.05, 0.25, m) * (1.0 - metalK);
    float k      = metalK + 0.45 * clothK;
    float fres   = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 2.6);
    vec3  add    = vec3(0.0);
    // steel (>= 4): sheen + sweep
    float sweep = smoothstep(0.0, 0.10, 0.5 - abs(fract(dot(vArmBind, vec3(0.7, 1.0, 0.4)) * 0.8 - uArmTime * 0.31) - 0.5));
    add += vec3(0.78, 0.86, 1.0) * (0.30 * fres + 0.45 * sweep) * metalK;
    // blue (>= 7)
    float t2 = step(7.0, lv);
    add += vec3(0.25, 0.66, 1.0) * t2 * k * (0.35 * fres + 0.18 * (0.5 + 0.5 * sin(uArmTime * 4.5)) * (0.4 + fres));
    // purple runes (>= 9)
    float t3   = step(9.0, lv);
    float rune = step(0.88, armHash(floor(vArmBind * 14.0) + floor(uArmTime * 2.0)));
    add += vec3(0.70, 0.30, 1.0) * t3 * k * (0.90 * rune + 0.25 * fres);
    // flame (>= 12)
    float t4 = step(12.0, lv);
    float fl = armHash(vec3(floor(vArmBind.x * 10.0), floor(vArmBind.y * 9.0 - uArmTime * 3.5), floor(vArmBind.z * 10.0)));
    add += mix(vec3(1.0, 0.25, 0.12), vec3(1.0, 0.78, 0.25), fl) * t4 * k * (1.10 * smoothstep(0.55, 1.0, fl) + 0.35 * fres);
    // prism (15)
    float t5 = step(15.0, lv);
    add += armHue(vArmBind.y * 0.9 + uArmTime * 0.25) * t5 * k * (0.90 * fres + 0.80 * rune);
    // tier amplitude clamp so bloom never explodes
    float amp = lv >= 15.0 ? 2.4 : lv >= 12.0 ? 2.0 : lv >= 9.0 ? 1.6 : lv >= 7.0 ? 1.2 : 0.9;
    totalEmissiveRadiance += min(add, vec3(amp)) * uArmLod;
  }
  // set-completion pulse (§1.5): independent of the upgrade levels
  if (uArmSet.w > 0.001) {
    float f2 = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 2.0);
    totalEmissiveRadiance += uArmSet.rgb * f2 * uArmSet.w * uArmLod;
  }
}
```

**1.3.4 Runtime API of the shader module** (what `ArmorGlows` and the dev page call):

```ts
export interface ArmorShaderHandle {
  setLevels(lv: readonly number[]): void;   // 6 numbers, helm shoulders chest gloves legs boots
  setTime(t: number): void;                 // seconds, from ArmorGlows.update
  setLod(k: number): void;                  // 0..1 (distance fade)
  setDebug(on: boolean): void;
  setSetPulse(color: number, w: number): void;          // set-completion silhouette pulse, w 0..1 (§1.5)
  setTint?(slot: number, color: number | null): void;   // P2 base-tier tint, §1.9
  dispose(): void;                          // removes the patch from the materials it patched (restores prev callbacks)
}
export function buildArmorMask(base: THREE.Texture): THREE.DataTexture;
export function ensureSlotAttribute(mesh: THREE.Mesh): void;
export function attachArmorShader(root: THREE.Object3D, mask: THREE.Texture): ArmorShaderHandle | null;
```

**1.3.5 Cost.** Zero extra draw calls, zero extra passes. Fragment cost: one extra `texture2D` + ≈ 60 ALU only when `lv >= 4` (dynamic branch is coherent per slot region). Skinned vertex shader: +2 varyings. Budget: ≤ 0.3 ms GPU for 5 characters on a mid PC at 640 × 360 internal resolution (PSX low-res buffer).

**1.3.6 Clone / reload safety.** `Assets.cloneMaterials()` runs before `attachArmorShader`, so each character instance owns its materials (and its `uArm*` uniform objects). `CharacterModel.applyVariant()` only swaps `map`/`color`, it never re-clones. If any code calls `Assets.cloneMaterials(body)` again (preview code does), `ArmorGlows.set()` re-attaches when it finds a patched material missing from `ARMOR_UNIFORMS` (check on every `set`). `dispose()` restores `onBeforeCompile`/`customProgramCacheKey` and drops the uniforms. A new shader version bumps `ARMOR_SHADER_VERSION` in the cache key.

### 1.4 Particles and light (`src/vfx/ArmorGlow.ts`, class `ArmorGlows`, API `G.vfx.armorGlow(root, look, ctx)`)

`ArmorGlows` mirrors `WeaponGlows`: a `Map<root, State>`, `set` (idempotent, cheap when nothing changed), `remove`, `clear`, `update(dt)`. It owns the shader handle (levels, time, LOD) **and** the particle emission. Emission reuses `fx.add.spawn` presets exactly like `WeaponGlow.emit` (same textures: `star-01`, `flare-01`, `cross`, `flame-tongue-01/02`, `px`).

| Body tier (`L_body`) | Particle kind | Rate (local player) | Rate (remote ≤ 25 m) | Rate (remote 25–45 m) | Spawn anchors | Light |
|---|---|---:|---:|---:|---|---|
| < 9 | none | 0 | 0 | 0 | – | – |
| 9–11 purple | motes `star-01/flare-01/cross`, c0 white → c1 `0xb14cff`, life 0.5–1.0 s, size 0.07–0.14, rise 0.2–0.7 m/s | 6 /s | 4 /s | 2 /s | slots whose own level ≥ 9 (see below) | – |
| 12–14 flame | 60 % `px` embers (c0 `0xffe090` → c1 `0xff3010`, rise 0.5–1.4) + 40 % `flame-tongue-01/02` (size 0.16–0.26, life 0.25–0.5) | 14 /s | 9 /s | 4 /s | slots ≥ 12 | – |
| 15 prism | sparkles `star-01/cross/star-04/flare-01`, hue = `t · 0.25 + rnd(0.3)`, life 0.45–0.95, size 0.08–0.2, spin ±4 | 22 /s | 14 /s | 6 /s | slots ≥ 12 | `fx.light(p, hue, 6, 0.14, 4)` every 0.12 s, **local player only** |

* **Anchors** (bones of the shared KayKit rig, fetched with `model.getBone`): helm → `head`, shoulders → `upperarm.l` / `upperarm.r`, chest → `chest`, gloves → `hand.l` / `hand.r`, legs → `upperleg.l` / `upperleg.r`, boots → `foot.l` / `foot.r`. Each frame the emitter picks a random anchor among the slots whose **own** tier qualifies, then jitters the point inside a 0.25 m sphere. Total rate is split across active anchors, so a single prism chest emits all 22 /s from the chest.
* **LOD (`update`)**: distance `d` to `fx.camPos`. `uArmLod = clamp((55 − d) / 25, 0, 1)` (full ≤ 30 m, off ≥ 55 m). Particles: remote players beyond 45 m emit nothing. **At most 4 characters** emit at the same time (sorted by distance, the local player always counts). The shared particle pool already has a hard cap; `ArmorGlows` additionally refuses to emit while `fx.add.aliveCount() > 1800` if that accessor exists (otherwise skip the check).
* **Setting `armorGlow`**: `'off'` = shader levels forced to 0 and no particles; `'low'` = shader only (no particles, no light); `'high'` = everything. Local player shows the preview in the Character panel regardless (shader only).
* **Hidden models** (`root.visible === false`, dead players whose model is hidden, models removed from the scene) stop emitting, and `update` drops states whose root left the scene (same loop as `WeaponGlows.update`).

### 1.5 Set completion aura

Piece counting is by `item.setId` over the equipped items (old 4-piece sets `set_*` and the 5-piece tier sets `tier_<specId>` of GDD_V2 §6). `SetAura = { id, count, total, color }` inside `ArmorLook.set`. Colours (`SET_AURA_COLORS` in `data/itemVisuals.ts`):

| Set id | Colour | | Set id | Colour |
|---|---|---|---|---|
| `set_holy_vanguard` Kutsal Öncü | `0xffe9a0` gold-white | | `tier_knight_protector` | `0x7fb8ff` |
| `set_wolfblood` Kurt Kanı | `0xc02030` blood red | | `tier_knight_blademaster` | `0xffd070` |
| `set_archmage_legacy` Başbüyücünün Mirası | `0x8a60ff` arcane violet | | `tier_barbarian_warlord` | `0xff6a30` |
| `set_shadow_veil` Gölge Peçesi | `0x3fe0c8` teal | | `tier_barbarian_butcher` | `0xd02030` |
| (unknown set) | `0xffffff` | | `tier_mage_elementalist` | `0xff9a4a` |
| | | | `tier_mage_lightbringer` | `0xfff2b0` |
| | | | `tier_rogue_assassin` | `0x9060ff` |
| | | | `tier_rogue_alchemist` | `0x70e07a` |

| Condition | Effect |
|---|---|
| `count ≥ 2` | faint **ground sigil**: an additive ring decal (`set_aura` vfx, radius 1.1 m, alpha 0.25, rotating 20°/s), parented to the model root (follows the feet) |
| `count ≥ total − 1` (3/4 or 4/5) | sigil alpha 0.55 + **shoulder motes**: 5 /s in the set colour from `upperarm.l/r` (counts against the 4-character emission cap) |
| `count == total` | sigil alpha 0.85 + 8 /s motes + **silhouette pulse** every 6 s: a 0.6 s fresnel flash over the whole model in the set colour (`handle.setSetPulse(color, w)` drives `uArmSet`; `w` ramps 0 → 1 → 0 over 0.6 s) |

The set aura is **independent** of upgrade tiers (a +0 full set still glows; a +15 mismatched set glows prism). When both are active the particle cap is shared and the **higher rate wins** (they do not add). `ArmorLook.set` is `null` when no set piece is worn.

### 1.6 Weapons, shields, pendant

* **Weapon `+4`:** add the `steel` row (§1.1) to `TIERS` in `WeaponGlow.ts`; `glowTier()` in `data/upgrades.ts` gains `glow_steel` (name "Çelik Cila"). Existing tiers are untouched.
* **Shield / off-hand tome** use the same shell path (`mountAttached` already calls `weaponGlow` for every non-helm attached item). Built-in KayKit stand-ins (no GLB) get the glow through `getWeaponRoot` as today.
* **Helmet GLB attached from an item** (`slot === 'helm'` in `mountAttached`): today `weaponGlow(obj, 0)` is forced; keep it, the helm is shown by the armor shader (slot 0) because attached helm GLBs use the same palette materials (they are patched through `attachArmorShader` as well when `obj` has a `map`). If an item model has no palette (generated GLB), it simply gets no armor glow.
* **Amulet pendant (P2):** one 0.12 m emissive billboard sprite on bone `chest`, visible when the equipped amulet is ≥ +7, colour = the tier colour. Cost: 1 sprite.

### 1.7 Replication, preview, menu

* **Net:** extend `VISIBLE_SLOTS` in **both** `src/entities/Player.ts` and `src/net/Replication.ts` to `['weapon','offhand','helm','shoulders','chest','gloves','legs','boots']`. `compactItem` already keeps `upgrade` and `setId`; add `broken` (so a Kırık piece does not glow). Payload impact: ≈ 5 more compact items (≈ 90 bytes each) **only when equipment changes**, never at 15 Hz. `cleanItem` accepts the new slots through the existing `ident` validators.
* **`ArmorLook` is computed on the receiving side** from the received items by the pure function `computeArmorLook(gear, hideHelm)` (`src/entities/armorLook.ts`, player module), so there is no new message. Remote players update on the existing `gear` message.
* **Character panel / menu preview:** `CharacterPreview` calls `loadCharacterModel` in its own scene, so the **shader part works there automatically** (it only needs the model's `ArmorLook`); particles are skipped (no `G.vfx` scene). The menu's 3D character select shows the same shader (it passes the saved equipment as `gear`).
* **Town mannequin / home mannequin (P3)** reuse `loadCharacterModel` + `setGear` and therefore show the same glow.

### 1.8 Settings, performance, verification

| Item | Value |
|---|---|
| Setting | `Ayarlar → Grafik → Zırh Parlaması`: Kapalı / Düşük / Yüksek (`armorGlow`) |
| Budget | shader ≤ 0.3 ms GPU (5 characters), particles ≤ 120 alive from armor, `ArmorGlows.update` ≤ 0.1 ms CPU |
| Verification page | `dev/vfx.html`: button row "Zırh" with `+0 / +4 / +7 / +9 / +12 / +15` for all six slots, a slot picker (set one slot to +15 to see the region), "Slot debug", "Set aura 2/4/full", class picker (4 GLBs), "Kaskı gizle" |
| Acceptance | (1) Knight +15 chest: plate glows prism, skin and cloth do not (cape gets a faint wash); (2) shoulders +12 only: both upper-arm regions burn, gauntlets do not; (3) slot debug shows six distinct regions on all four GLBs; (4) hit flash and status tints still read; (5) no console errors when the model is cloned, hidden, disposed and rebuilt 20 times; (6) PSX affine and snap still active (wobble visible) |

### 1.9 Optional P2: base-tier tint (resolves GDD_SYSTEMS §4.1 / O-IT7)

With the mask in place the old design "T2 steel-blue, T3 gold trim, T4 dark red, T5 teal emissive" costs one uniform: `uArmTint[6]` (vec3, default white) multiplies **metal and trim only** (`albedo = mix(albedo, albedo * tint, metalK)` before lighting, i.e. injected after `map_fragment`). Colours by base `tier`: T1 none, T2 `#8fa9c8`, T3 `#d9b45a`, T4 `#9c2f2f`, T5 `#3fe0c8` (+ a weak emissive 0.15). `ArmorLook.tint?: (number | null)[]` carries it. Not part of P0/P1.

---

## 2. Deeper basma (upgrading)

### 2.1 What stays, what is added

**Stays exactly as in GDD_SYSTEMS §5.1 / `data/upgrades.ts`:** +0 … +15, base success chances, gold multipliers, Kara Demir / Büyülü Toz / Ejderha Pulu / Ruh Taşı costs, cumulative weapon / armor / efsun-boost percentages, max level by rarity (+9 / +9 / +12 / +15), "+15 adds a socket and the title 'Kusursuz'", salvage return of 30 %.

**Added on top (each one is a separate lane, no two do the same job):**

| Lane | Name | Origin | What it changes |
|---|---|---|---|
| Soft pity | **Talih Birikimi** (failstacks) | BDO | every failed attempt ≥ +7 raises the chance of the next attempt, per **character**, across items |
| Pity storage | **Değerli Taş** | BDO "Valks' Cry" / failstack farming | convert stacks into a stone, buy / sell stones, load stacks back |
| Chance boosters | **Yükseltme Kâğıtları** Düşük / Orta / Yüksek | Knight Online upgrade scrolls | +5 / +10 / +15 pp and softened failures |
| Protection | **Kutsama Kağıdı** (exists) | Metin2 / KO blessing | failure keeps the level, nothing breaks |
| Failure design | **Break rules** + **Kırık** state + **Demirci Acıması** | KO / Lost Ark durability | bound items are never deleted, streaks are capped |
| Post-+15 | **Ustalık** | Diablo 4 masterworking | 5 guaranteed ranks, +3 % on all affix values each |
| Feedback | **Ceremony**, announcements, **Basma Günlüğü** | Metin2 / KO server messages | drama, social proof |

### 2.2 Success chance (final formula)

```
base(target)       = UPGRADE_STEPS[target].chance                      // unchanged table (100 … 5 %)
stackBonus(target) = target >= 7 ? min(STACK_RULES[target].cap, STACK_RULES[target].pp * stacks) : 0      // percentage points
scrollBonus        = SCROLLS[chosen scroll].pp                         // 0 / 5 / 10 / 15
chance             = min(0.97, base + (stackBonus + scrollBonus) / 100)
KADER EŞİĞİ        : if target >= 7 and stacks >= STACK_MAX (60)  ->  chance = 1.0 and ALL stacks are consumed
```

The panel shows the three terms as a stacked bar ("Taban %5 · Talih +%13.5 · Kâğıt +%15 = %33.5"). Targets +1…+6 never use stacks and never add stacks.

### 2.3 Talih Birikimi (failstacks)

Stored per character: `CharacterSave.upg.stacks` (0–60). Persisted, survives item destruction, shared by every item.

| Target | Base | Stacks gained per failure | pp per stack | Max stack bonus (pp) | Kept after a **success** (`keep`) | Chance at 0 / 20 / 40 / 59 stacks |
|---|---:|---:|---:|---:|---:|---|
| +7 | 60 % | +1 | 0.5 | 25 | 75 % | 60 / 70 / 80 / 85 |
| +8 | 50 % | +1 | 0.5 | 25 | 75 % | 50 / 60 / 70 / 75 |
| +9 | 40 % | +1 | 0.5 | 25 | 75 % | 40 / 50 / 60 / 65 |
| +10 | 30 % | +2 | 0.6 | 30 | 40 % | 30 / 42 / 54 / 60 |
| +11 | 25 % | +2 | 0.6 | 30 | 40 % | 25 / 37 / 49 / 55 |
| +12 | 20 % | +2 | 0.6 | 30 | 40 % | 20 / 32 / 44 / 50 |
| +13 | 15 % | +3 | 0.5 | 30 | 0 % | 15 / 25 / 35 / 44.5 |
| +14 | 10 % | +3 | 0.5 | 30 | 0 % | 10 / 20 / 30 / 39.5 |
| +15 | 5 % | +3 | 0.5 | 30 | 0 % | 5 / 15 / 25 / 34.5 |

* A failure adds the stacks of **its target row** whatever the failure outcome was (stay, −1, destroy, break, protected).
* A success at target `t` sets `stacks = floor(stacks × keep(t))`. Low successes barely dent the pool, +13…+15 empty it ("BDO: stacks are spent on the big one").
* `STACK_MAX = 60` (cap). At 60 stacks the next attempt at target ≥ +7 is guaranteed (**Kader Eşiği**, §2.7), then stacks reset to 0.
* UI: a horizontal bar "Talih 23 / 60" with notches at 10 / 20 / 30 / 40 / 50 and a gold marker at 60 labelled "Kader".

**Expected number of attempts to succeed at one target** (Monte Carlo, 200 000 runs, natural stack growth from the stated start; "pity-free" = old rule 1 / p):

| Target | pity-free | start 0 | start 20 stacks | start 40 stacks | start 0 + Yüksek Kâğıt (+15 pp) | share of runs ended by Kader Eşiği (start 0) |
|---|---:|---:|---:|---:|---:|---:|
| +7 | 1.67 | 1.66 | 1.42 | 1.25 | 1.33 | 0 % |
| +8 | 2.00 | 1.98 | 1.66 | 1.42 | 1.53 | 0 % |
| +9 | 2.50 | 2.46 | 1.98 | 1.66 | 1.81 | 0 % |
| +10 | 3.33 | 3.09 | 2.30 | 1.82 | 2.16 | 0 % |
| +11 | 4.00 | 3.59 | 2.58 | 2.00 | 2.40 | 0 % |
| +12 | 5.00 | 4.28 | 2.92 | 2.21 | 2.71 | 0 % |
| +13 | 6.67 | 5.02 | 3.54 | 2.64 | 3.05 | 0.1 % |
| +14 | 10.0 | 6.24 | 4.15 | 2.98 | 3.53 | 0.4 % |
| +15 | 20.0 | 8.05 | 4.99 | 3.39 | 4.15 | 1.3 % |

Tuning knobs (all in `data/upgradesV2.ts`, no code change): `pp`, `cap`, `gain`, `keep`, `STACK_MAX`, `CHANCE_CAP`. Re-run `dev/items.html` → "Basma simülasyonu" after any change.

### 2.4 Değerli Taş (store, load, sell, buy stacks)

A **Değerli Taş** is a stackable pouch material that remembers a fixed number of stacks: `degerli_tas_10`, `_20`, `_30`, `_40`, `_50`. Everything happens in the Yükselt tab drawer "Talih Taşları" at the Demirci (Kuzgunkale and village blacksmiths).

| Action | Rule | Numbers |
|---|---|---|
| **Taşa Aktar** (create) | choose a size ≤ current stacks; pay the fee; stacks −= size; +1 stone | fee = 400 × size gold: 10 → 4,000 · 20 → 8,000 · 30 → 12,000 · 40 → 16,000 · 50 → 20,000 |
| **Taştan Yükle** (load) | consume one stone; `stacks = min(60, stacks + size)`; free; only at a blacksmith; **not usable while an upgrade animation runs** | – |
| **Satın Al** (buy) | Demirci sells stones for gold, **1 stone of each size per day** (reset 04:00) | price = `round(6000 × size × (1 + size / 40))`: 10 → 75,000 · 20 → 180,000 · 30 → 315,000 · 40 → 480,000 · 50 → 675,000 |
| **Sat** (NPC sell) | Demirci / any vendor buys stones back at 25 % of the buy price | 10 → 18,750 · 20 → 45,000 · 30 → 78,750 · 40 → 120,000 · 50 → 168,750 |
| Trade | stones are **not** `bound`; there is no trading in v1 (GDD_SYSTEMS §7.5), but they are the intended first trade good and the only way to move stacks to another character through the future shared stash | – |

Rarity: 10 / 20 rare (blue), 30 / 40 epic (purple), 50 legendary (orange). Icon `item-upgrade-stone` tinted. **Why it is not an exploit:** a stack costs ≈ 6–8 k gold to farm (attempts at +7 on a cheap ilvl-10 item: 2.4 k gold + 4 Büyülü Toz + 1 Ejderha Pulu per attempt, 1 stack per failure, ≈ 2 attempts per stack) and ≈ 10.5 k to buy at size 30, while selling back pays only 2.6 k per stack: farming → converting → selling always loses money. **Stack farming** (the BDO loop) is therefore supported but never profitable by itself.

### 2.5 Yükseltme Kâğıtları (scroll tiers) and Kutsama Kağıdı

One scroll per attempt (choose none / Düşük / Orta / Yüksek), plus an optional Kutsama Kağıdı. Scrolls are consumed on every attempt (success or failure).

| Item | id | Chance bonus | Usable targets | Failure softening (when **not** protected) | Sources | Gold price |
|---|---|---:|---|---|---|---:|
| Düşük Yükseltme Kâğıdı | `yukseltme_dusuk` | +5 pp | +3 … +9 | none | Seçkin 6 %, Patron 25 %, Günlük Sandık 15 %, Mühürdar 8 Av Mührü | 1,500 (no daily cap) |
| **Orta** Yükseltme Kâğıdı (= `demirci_el_kitabi`, O-IT3) | `demirci_el_kitabi` | +10 pp | +5 … +12 | **−1 becomes "stays"** (targets +7…+9) | existing (Av Mührü 25, boss 2 %), Patron 8 %, M+ boss (key ≥ 4) 10 % | 12,000 (max 3 / day) |
| Yüksek Yükseltme Kâğıdı | `yukseltme_yuksek` | +15 pp | +8 … +15 | −1 becomes "stays"; **destroy / break becomes −3 levels** | M+ end chest timed (key ≥ 6) 20 %, raid boss N 6 % / K 12 % / M 20 %, Mühürdar 120 Av Mührü | not sold for gold |
| Kutsama Kağıdı | `kutsama_kagidi` | 0 | +7 … +15 | **any failure keeps the level**, nothing breaks, nothing is deleted | existing (M+ chest timed key ≥ 10, Günlük Sandık 10 %, Av Mührü 50) + raid boss K 8 % / M 15 % | not sold for gold |

Combination rules: a scroll and Kutsama can be used together (the scroll's chance bonus still applies, its softening becomes irrelevant). Two scrolls never stack. A scroll that is not usable for the target is greyed with "Bu kademede kullanılamaz". The sum chance is capped at 97 % (Kader Eşiği is the only way to 100 %).

### 2.6 Failure rules: downgrade, break, destroy, Kırık, Demirci Acıması

**Failure outcome table (no Kutsama, no scroll softening).** "Bound" = `item.bound` or rarity `legendary` / `set` or `uniqueId` set (every Efsanevi, Set and Tier piece).

| Target | Base chance | Unbound item | Bound item |
|---|---|---|---|
| +1, +2 | 100 | cannot fail | cannot fail |
| +3 … +6 | 95 / 90 / 80 / 70 | stays (materials lost) | stays |
| +7 … +9 | 60 / 50 / 40 | **−1 level** | **−1 level** |
| +10 … +12 | 30 / 25 / 20 | **destroyed** | **Kırık** (broken) |
| +13 … +15 | 15 / 10 / 5 | **destroyed** | **Kırık** |

**Softening** (§2.5): Orta, Yüksek turn "−1" into "stays"; Yüksek turns "destroyed / Kırık" into **−3 levels** (`max(0, level − 3)`). Kutsama turns every failure into "stays".

**Kırık (broken) state** — replaces deletion for bound items:

| Aspect | Rule |
|---|---|
| Data | `ItemInstance.broken = true`, `upgrade = max(0, level − 3)` immediately (the repair does not return the lost levels) |
| Effects | contributes **0 stats**, cannot be equipped (an equipped piece is unequipped to the bag), cannot be upgraded / efsun'd / socketed, no glow, can be salvaged (normal yields, upgrade-material return **halved**) |
| Tooltip | red header "KIRIK", the name struck-through, line "Demirci onarabilir" |
| Repair (Demirci → Yükselt tab, "Onar") | gold = `round(300 × ilvl × (1 + 0.15 × levelBeforeFail))`, `ruh_tasi × (2 + floor(levelBeforeFail / 4))`, `ancient_dust × 5` (Kadim Toz); the item keeps `upgrade = levelBeforeFail − 3`; `broken` cleared |
| Why | Efsanevi / Set / Tier drops are soulbound, hard-earned and not replaceable by gold, so deleting them is a feel-bad with no recourse; the repair bill (≈ 50 k gold + 5 Ruh Taşı + 5 Kadim Toz after a failed +12 → +13 attempt at ilvl 60, item returns at +9) keeps the sting |

**Demirci Acıması** (streak guard). `upg.destroyStreak` counts consecutive destroy / Kırık outcomes (reset by any success, any protected failure, any softened failure, any pity success). When `destroyStreak ≥ 2` **and** the next attempt targets ≥ +12 **and** it fails without protection, the outcome is softened to **−3 levels** (as Yüksek would) and the streak resets. The panel shows a small gold hand icon "Demirci acıması hazır" when the streak is armed (the player knows the safety net exists; the *roll* is still the player's gamble).

**Banner texts** (ceremony, §2.9): `BAŞARILI!` · `BAŞARISIZ!` (sub: "Seviye korundu." / "Seviye düştü: +9 ➜ +8" / "Kutsama Kağıdı seni korudu!" / "Kâğıt seni korudu: −1 yerine seviye korundu." / "Yüksek Kâğıt kurtardı: +14 ➜ +11") · `EŞYA YOK OLDU!` (sub "Demirci başını salladı...") · `EŞYA KIRILDI!` (sub "Demirci onarabilir.") · `KADER SENİN YANINDA!` (Kader Eşiği success) · `DEMİRCİ ACIDI!` (Acıma).

### 2.7 Pity: the three layers in one table

| Layer | Trigger | Effect | Resets |
|---|---|---|---|
| **Soft pity** — Talih Birikimi | every failure ≥ +7 | +1 / +2 / +3 stacks → +0.5 … +0.6 pp per stack on every later attempt ≥ +7 | partially on success (`keep`) |
| **Hard pity** — Kader Eşiği | `stacks ≥ 60` | next attempt ≥ +7 succeeds (100 %), all stacks consumed | on use |
| **Streak guard** — Demirci Acıması | 2 destroy / Kırık in a row, next attempt ≥ +12 fails | outcome softened to −3 | on use or any non-destroy result |

There is **no per-item pity any more** (O-IT4). The old `ItemInstance.failStacks` is ignored and removed the next time the item is upgraded.

### 2.8 Ustalık (masterworking, Diablo 4) — the only progression above +15

| Rule | Value |
|---|---|
| Who | any equipment item with `upgrade === 15`, rarity `epic` / `legendary` / `set`, not `broken`, not `corrupted` (Bozulma'lı eşya **can** be mastered: only crafting orbs are refused) |
| Ranks | 1 … 5 (`item.mw`); Yükselt tab switches to "Ustalık" mode at +15 |
| Success | **100 %** (Diablo's masterworking never fails): the cost is the gate |
| Effect | `valueMult(line) = 1 + efsunBonus(+N) × (random lines only) + 0.03 × mw` for **every affix line** (random, fixed legendary / set lines, `bench`, `special`, local weapon / armor percentages). Base weapon damage, implicit stats, gems and Tılsım are **not** multiplied. Rank 5 = +15 % on every line |
| Display | tooltip "Ustalık V (+%15 efsun gücü)"; item name suffix `(Usta İşi)` at rank 5; gold-white edge on the +15 prism look (the `prism` tier gets `amp × 1.1`); `UPGRADE_ILVL` equivalence `MW_ILVL = [0,1,2,3,5,7]` (O-IT8) |
| Cost per rank | gold `(5000 + 300 × ilvl) × [1, 2, 4, 7, 12][rank − 1]`; `ruh_tasi` `[2, 3, 4, 6, 8]`; `ejderha_pulu` `[10, 14, 18, 24, 30]`; `ancient_dust` `[5, 10, 15, 25, 40]` (Kadim Toz, GDD_V2 §5.3 definition). Total at ilvl 60: 23 k + 46 k + 92 k + 161 k + 276 k ≈ **598 k gold**, 23 Ruh Taşı, 96 Ejderha Pulu, 95 Kadim Toz |
| Orb link | `orb_corrupt` outcome "+1 Ustalık rank" (O-IT1): rank is stored even below +15 and takes effect when the item reaches +15 (`mwEffective = upgrade >= 15 ? mw : 0`) |
| Salvage | returns the usual yield, **no** refund of Ustalık materials |
| Budget | ≤ +75 BP on a 5-line Destansı (§4.7) |

### 2.9 The blacksmith ceremony (anvil sparks, success ding, failure crack)

Implemented in the panel stage (`Ceremony.ts`, uses `ForgeFx` + banner + hammer) and on the Demirci NPC in the town scene. Times in ms from the click on "YÜKSELT". `fastForge` (setting) or a click / Space during the sequence skips to the reveal with the remaining delays × 0.15.

| Phase | t (ms) | Panel (ForgeFx / DOM) | Sound | NPC / world |
|---|---:|---|---|---|
| Hazırlık | 0 – 250 | UI locks, hammer raises, heat 0.2 → 0.5, "YÜKSELT" button greys | – | Haldun plays `1H_Melee_Attack_Chop` (existing idle loop speeds up) |
| Strikes | `250 + 380·i` for `i = 0..n−1`, `n = 3` (target ≤ +9), `4` (+10…+12), `5` (≥ +13) | per strike: `sparks(CX, CY, [18, 26, 40, 60, 90][i], '#ffb347')`, `shake-s`, slot `pulseSlot`, heat += 0.15, slot glow colour ramps orange → white | `forge_strike` pitch `0.9 + 0.05·i` | anvil flare `torch_fire` ×1.4 for 0.2 s |
| Gerilim (only if chance ≤ 25 % **or** target ≥ +13 **or** Kader Eşiği armed) | +700 | strikes stop, vignette dims 20 %, embers flicker, a thin gold ring fills (Kader armed: fills completely), final 80 ms white-out | `forge_heartbeat` at +0 and +350 | NPC `Idle` freezes |
| **Reveal: success** | T | `res-success` flash 120 ms; `sparks 90 + 6·level` gold, `ring(CX, CY, '#ffe08a', 190)`, `glints 14`; level counter counts up over 350 ms; banner `BAŞARILI!`; `≥ +12`: second ring red-gold + toast `levelup`; **`+15`**: 3 rainbow rings, 180 multi-colour sparks, 1.2 s rainbow edge vignette | `forge_ding` pitch `1 + 0.03·level` (sample `upgrade_success`); `+12/+15` add `ann_chime` | NPC `Cheer`; `+12`: `forge_announce` at the anvil; `+15`: `forge_announce_rainbow` + torch flare ×2 |
| **Reveal: failure (stays / −1 / −3)** | T | **crack**: `ForgeFx.crack(CX, CY)` draws 3 radial hairlines over the slot in 150 ms, slot dims 400 ms, smoke 12, grey sparks 16, `shake-m`; level number ticks down in red when downgraded; banner `BAŞARISIZ!` + sub-line (§2.6) | `forge_crack` (sample `upgrade_fail` + `hit_blunt` layer at −1 octave) | NPC `Hit_B` |
| **Reveal: protected** | T | gold shield ring on the slot (`ring(..., '#ffe9a0', 150)` + `glints 8`), banner `BAŞARISIZ!` / "Kutsama Kağıdı seni korudu!" | `forge_crack` quiet (−6 dB) + `ui_levelup` soft | NPC `Hit_B` short |
| **Reveal: destroyed** | T | `shards(CX, CY, 34, rarityColor)`, `sparks 50 '#ff5a3a'`, smoke 14, red ring, `shake-l`, slot empties; banner `EŞYA YOK OLDU!` | `forge_shatter` (sample `upgrade_destroy`) | NPC `Hit_B`, head-shake (`Hit_A`) |
| **Reveal: Kırık** | T | like destroyed but `shards 14`, the item stays in the slot with a cracked overlay and red name; banner `EŞYA KIRILDI!` | `forge_shatter` −3 dB | NPC `Hit_B` |
| Cooldown | reveal + 900 (fail) / 1100 (success) / 1500 (destroy) | UI re-enabled, `Basma Günlüğü` line added | – | – |

Total length: 1.4 s (3 strikes) … 1.9 s (5 strikes); with Gerilim 2.1 … 2.6 s. `ForgeFx` additions: `crack(x, y)` and `ringFill(x, y, t01, color)`; both are tiny canvas routines in the same file.

### 2.10 Announcements (+12 / +15), Basma Günlüğü

| Event | Local | Party (all peers of the room) | Lobby (town) |
|---|---|---|---|
| success `+10`, `+11` | toast `levelup` | – | – |
| success `+12 … +14` | toast + gold system chat line | chat line (gold): `[Demirci] {ad}, {eşya} eşyasını +{n}'ye yükseltti!` + a small HUD banner (2.5 s) + `forge_announce` over the upgrader's avatar for peers in the same scene | – |
| success **`+15`** | full-screen rainbow flash 0.4 s + toast | rainbow chat line `[Duyuru] ★ {ad}, {eşya} eşyasını +15'e yükseltti! ★`, HUD banner "DUYURU" (6 s, rainbow text) with `ann_chime` on every peer, `forge_announce_rainbow` over the avatar for 10 s | the same text on the **lobby chat** (`lchat`, GDD_LIFE §3.8) so the whole town reads it |
| Ustalık rank 5 | gold line | party line "{ad}, {eşya} eşyasını Usta İşi yaptı!" | – |
| failure with item loss ≥ +12 | grey system line "(Demirci hüzünlü...)" | – | – |

Wire: the party line rides the existing `chat` channel with one new optional field `ann?: { k: 'upg' | 'mw'; n: string; l: number; r: Rarity; c?: ClassId }` (≤ 80 bytes; `n` goes through `sanitizeText`, `l` clamps 4…15). Receivers render the coloured line, the HUD banner and the avatar vfx from `ann` (no text parsing). Anti-spam: ≤ 1 `ann` per 10 s per sender; the lobby copy is sent only for `+15`. **Announcements are cosmetic and spoofable by design** (P2P, no authority); they never grant anything.

**Basma Günlüğü** (`CharacterSave.upg.log`, ring buffer of 20): `{ t, name, from, to, res, ch }` (`res`: 0 stays, 1 success, 2 down, 3 destroyed / Kırık, 4 protected, 5 pity), shown as a collapsible list in the Yükselt tab ("Son denemeler"): `+13 ➜ +14  %12  BAŞARILI`.

### 2.11 Economy check (ilvl 60, Monte Carlo 40 000 runs, Kutsama on every attempt ≥ +10)

Per-attempt cost at ilvl 60 = `1,300 × goldMult` gold plus the table's materials (unchanged). Expected totals for climbing a segment starting with 0 stacks:

| Segment | Pity-free (old) | Talih (natural) | Talih + Orta | Talih + Yüksek |
|---|---|---|---|---|
| **+6 → +9** | – | 6.1 att · 93 k gold · 31 Toz · 13 Pulu | 5.1 att · 77 k | 4.7 att · 71 k |
| **+9 → +12** | 12.3 att · 461 k gold | 10.7 att · **396 k** · 109 Toz · 55 Pulu · 22 Ruh · 11 Kutsama | 8.1 att · 298 k · 17 Ruh | 7.2 att · 265 k · 15 Ruh |
| **+12 → +15** | 36.7 att · 3.46 M gold | 19.3 att · **1.72 M** · 365 Toz · 199 Pulu · 100 Ruh · 19 Kutsama | 12.7 att · 1.12 M · 65 Ruh | 10.7 att · 0.94 M · 55 Ruh |
| **+9 → +15 (one item)** | 49 att · 3.92 M gold · 223 Ruh Taşı | 29.8 att · **2.11 M** · 471 Toz · 252 Pulu · 121 Ruh · 30 Kutsama | 20.7 att · 1.41 M · 81 Ruh | 17.9 att · 1.20 M · 70 Ruh · 18 Kutsama |

Reading: stacks cut the +15 chase by ≈ 40 %, a Yüksek scroll on every attempt by ≈ 63 %. A single +15 still costs ≈ 1.2 – 2.1 M gold (≈ 15 – 25 hours of L60 income at 70 – 90 k/h) and 70 – 120 Ruh Taşı (M+ bosses give 1 each, the timed chest 1 + ⌊key/3⌋), so **one** +15 piece per character per season is the intended ceiling. Design consequence: armor +12 (Kızıl-Altın Alev) is the realistic goal, **+15 Prizma is a trophy**, and the Ustalık ranks are the (very) late tail. A 30-stack stone only helps the first +10…+12 attempts (success keeps 40 %), which is intended: stones are for the first attempt of a risky climb, not a skip button.

### 2.12 Data and API (details in §7 IT-01 / IT-02)

```ts
// data/upgradesV2.ts (items)
export const STACK_MAX = 60, CHANCE_CAP = 0.97;
export const STACK_RULES: Record<number, { base: number; gain: number; pp: number; cap: number; keep: number }>;   // targets 7..15, table §2.3
export type ScrollId = 'yukseltme_dusuk' | 'demirci_el_kitabi' | 'yukseltme_yuksek';
export const SCROLLS: Record<ScrollId, { pp: number; min: number; max: number; softenDown: boolean; softenDestroy: boolean; name: string }>;
export const STONE_SIZES = [10, 20, 30, 40, 50] as const;
export const stoneId = (size: number) => `degerli_tas_${size}`;
export const stoneFee = (size: number) => 400 * size;
export const stoneBuyPrice = (size: number) => Math.round(6000 * size * (1 + size / 40));
export const stoneSellPrice = (size: number) => Math.round(stoneBuyPrice(size) * 0.25);
export const MASTERWORK = { maxRank: 5, pctPerRank: 0.03, goldMult: [1, 2, 4, 7, 12], ruh: [2, 3, 4, 6, 8], pulu: [10, 14, 18, 24, 30], dust: [5, 10, 15, 25, 40], ilvlEq: [0, 1, 2, 3, 5, 7] };
export type FailOutcome = 'stay' | 'down1' | 'down3' | 'destroy' | 'break';

// systems/Upgrade.ts v2
upgradeCost(item, opts?: { scroll?: ScrollId; protect?: boolean; useBook?: boolean /* alias of scroll:'demirci_el_kitabi' */ }): UpgradeCostV2 | null;
rollUpgradeOutcome(target, o: { stacks: number; scroll?: ScrollId; protect?: boolean; bound?: boolean; acima?: boolean }, r?: RNG): { success: boolean; outcome: 'success' | 'pity' | FailOutcome | 'protected' };
upgradeItem(uid, opts?: { scroll?: ScrollId; useProtection?: boolean; useBook?: boolean }): UpgradeResult;   // result gains: outcome, stacksBefore, stacksAfter, scrollUsed, acima
repairItem(uid): { ok: boolean; reason?: string };
// systems/Stacks.ts: stackState(), makeStone(size), loadStone(size), buyStone(size), sellStone(size)
// systems/Masterwork.ts: masterworkCost(item), masterwork(uid)
```

---

## 3. Deeper efsun (bonus enchanting)

### 3.1 The final model: one engine, two layers, **one verb = one item**

GDD_V2 §4.3 already ships PoE-style orbs ("a second, faster affix-crafting layer"); the Metin2 efsun items already exist in code; this request adds Metin2 depth (6th / 7th bonus, special efsun, reroll values, lock). Keeping both as two unrelated systems would give the player two ways to do the same thing and two panels to learn. **Decision: keep both families, but make them one system with two layers:**

* **One engine.** Every operation goes through `Crafting.applyCurrency(uid, currencyId, opts)` (§3.11). It uses the existing `ItemGen` affix functions, the same lock rules, the same slot caps, the same `corrupted` flag and emits the same event (`efsun:changed`). `Upgrade.efsun / kadimEfsun / takviye` (existing exports) become thin wrappers around it.
* **Layer A — Demirci Efsunu (Metin2).** Gold + efsun items, at the Demirci / Efsuncu Nergis, tab **Efsun**. *Bulk, predictable, gold sink, anti-frustration.* Items are sold or earned from daily content.
* **Layer B — Zanaat Küreleri (PoE).** Orbs and the Tezgâh, tab **Zanaat**. *Surgical or gambling, drop-fed currency, spam-click with a preview.*
* **One verb = one item.** No two items perform the same verb (the only exception is "add one", which has a *premium* variant on purpose). Every verb below has exactly one home:

| Verb | TR button | Layer A item (tab Efsun) | Layer B orb (tab Zanaat) | Touches |
|---|---|---|---|---|
| Reroll **all** lines | Tümünü Çevir | `efsun_nesnesi` **Efsun Nesnesi** | – | slots 1–5, locks respected |
| Reroll **one** line | Tek Çevir | – | `orb_chaos` **Kaos Küresi** | slots 1–5 (one random unlocked line) |
| **Add** one line | Efsun Ekle | `takviye_nesnesi` **Efsun Ekleme Nesnesi** (any tier; Normal → Büyülü) | `orb_exalt` **Yüceltme Küresi** (premium: tier ≤ T3 weighted 40 / 35 / 20 / 5, once per item) | slots 1–5 up to the rarity cap |
| **Remove** one line | Sil | – | `orb_annul` **Arınma Küresi** | slots 1–5, unlocked only |
| Reroll **values** only | Güçlendir | `kadim_efsun` **Efsun Güçlendirme Nesnesi** (O-IT2) | – | slots 1–5 and 7, tiers stay |
| **Lock** a line | Kilitle | `efsun_kilidi` **Efsun Kilidi** (1 lock = 1 Kilit, 2 locks = 3 Kilit) | – | protects against Nesnesi, Kaos, Arınma |
| Change **rarity** | – | – | `orb_chance` **Şans**, `orb_alchemy` **Simya** (V2 §4.3, unchanged) | Normal items |
| **Gamble** | – | – | `orb_corrupt` **Bozulma** (outcome 5 = +1 Ustalık, O-IT1) | Nadir+ |
| **Unlock slot 6** | Yuva Aç | `efsun_cekirdegi_6` **Gümüş Efsun Çekirdeği** | – | adds `bench: null` |
| **Fill slot 6** | Tezgâhta Yap | – | **Tezgâh** recipes (§3.5; cost uses Kaos) | `bench` |
| **Unlock slot 7** | Yuva Aç | `efsun_cekirdegi_7` **Altın Efsun Çekirdeği** | – | rolls `special` |
| **Reroll slot 7** | Kader | `kader_zari` **Kader Zarı** | – | `special` only |
| Gem sockets | (Taşlar tab) | `oyma_kalemi` Oyma Kalemi (existing) | – | `sockets` |
| Move one line (P3) | Aktar | `efsun_aktarma` **Efsun Aktarma Nesnesi** | – | §3.10 |

**Why this and not "merge everything into orbs" or "delete the orbs":** (1) the orb drop tables of V2 are the *content reward* of M+ and the raid (they must stay); (2) Efsun Nesnesi / Kilidi are the *gold sink* of the Metin2 loop and exist in loot tables, vendors and saves already; (3) the two layers answer different player moods (a safe "reroll the lot, lock what I like" session vs. a gambling "chaos-spam one line" session); (4) a shared engine means a single set of rules and tests, and one widget (`EfsunList`) renders slots, locks and previews in both tabs.

**Rarity gating (what each verb accepts)** — `corrupted` items refuse every verb in this table; "—" = refused.

| Rarity | Lines (slots 1–5) | Nesnesi | Ekleme | Yüceltme | Kaos | Arınma | Güçlendirme | Slot 6 | Slot 7 |
|---|---:|---|---|---|---|---|---|---|---|
| Sıradan, Normal | 0 | — | Normal → Büyülü | — | — | — | — | — | — |
| Büyülü | 1–2 | ✓ | ✓ (to 2) | — | ✓ | ✓ | ✓ | — | — |
| Nadir | 3–4 | ✓ | ✓ (to 4) | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Destansı | 5 | ✓ | ✓ (to 5) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Efsanevi (Aspektli) | 1 random + fixed | random line only | ✓ (to 1) | ✓ | ✓ (random line) | ✓ (random line; the aspect never leaves) | ✓ (random line + slot 7) | ✓ | ✓ |
| Efsanevi (named `leg_*`) | 1 random + fixed | random line only | — | — | — | — | random line | ✓ | ✓ |
| Set / Tier | 0 random (4–5 fixed) | — | — | — | — | — | — | ✓ | ✓ |

(The last row is the point of slots 6 and 7: **Set and unique pieces finally have a personal customisation lane** without breaking their fixed identity. Slots 6 and 7 are further limited by *equipment slot*, see §3.2.)

### 3.2 Anatomy: seven efsun slots

| Slot | Name (TR) | How many | Stored as | Filled by | Rerolled / changed by | Locked by Kilit | Gets +N boost / Ustalık |
|---|---|---|---|---|---|---|---|
| 1 – 5 | **Ana Efsunlar** | by rarity (Büyülü 2, Nadir 4, Destansı 5; Efsanevi 1) | `item.affixes[]` | drop roll, Ekleme, Yüceltme | Nesnesi, Kaos, Arınma, Güçlendirme | yes | boost on random lines, Ustalık on all |
| **6** | **Tezgâh Efsunu** (silver pip) | 1, needs Gümüş Çekirdek | `item.bench?: RolledAffix \| null` (`null` = open and empty) | Tezgâh recipe (§3.5): **you choose it** | re-craft at the Tezgâh (replaces), "Temizle" (free) | never rerolled by others, no Kilit needed | yes |
| **7** | **Özel Efsun** (gold pip) | 1, needs Altın Çekirdek | `item.special?: RolledAffix \| null` | random from the Özel pool (§3.6) at unlock | Kader Zarı (reroll type + value), Güçlendirme (values) | never rerolled by others | yes |

**Eligibility.** Rarity: slot 6 = Nadir, Destansı, Efsanevi, Set (not Büyülü, not Sıradan / Normal); slot 7 = Destansı, Efsanevi, Set. **Equipment slot** (this keeps the character-wide power budget of §4.7 under control, and gives every slot a job): slot 6 on the **8 body and hand slots** (`weapon`, `offhand`, `helm`, `shoulders`, `chest`, `gloves`, `legs`, `boots`); slot 7 only on the **three "big" slots** `weapon` (offence), `chest` (defence) and `amulet` (utility). Belt and rings carry no 6th / 7th line (rings and the amulet have Kazıma rows, §4.5). Unlocking is **permanent** and consumes the core; the slots are independent of each other. The item tooltip shows seven pips (5 round, silver, gold) before the lines (§6.4).

### 3.3 Value tiers and weights

**Slots 1–5 (unchanged, shown for reference).** Tier gates by ilvl `T5 1 · T4 12 · T3 24 · T2 36 · T1 50 · T0 72`, weights `100 / 75 / 50 / 30 / 15 / 5`; intra-tier scaling `value × (1 + 0.0035 × (ilvl − gate))` capped at +8 % (GDD_LIFE §6.2); Destansı uses only the best 3 eligible tiers.

| ilvl | T5 | T4 | T3 | T2 | T1 | T0 | Destansı best-3 |
|---|---:|---:|---:|---:|---:|---:|---|
| 60 (non-M+) | 37.0 % | 27.8 % | 18.5 % | 11.1 % | 5.6 % | – | T3 52.6 % · T2 31.6 % · T1 15.8 % |
| 72+ (M+) | 36.4 % | 27.3 % | 18.2 % | 10.9 % | 5.5 % | 1.8 % | T2 60 % · T1 30 % · T0 10 % |

**Slot 6 (Tezgâh):** no roll. `value = round(0.75 × mid(best non-T0 tier eligible at the item's ilvl))`, i.e. 75 % of the middle of the best normal tier. Example at ilvl 60, `suf_crit_damage` (T1 31–38): `0.75 × 34.5 = 26 %`. A rolled T1 line can reach 38 %, so the bench is **reliable, never the best**.

**Slot 7 (Özel):** four **S-tiers** with their own gates and weights (the pool has far fewer entries, so fewer tiers):

| S-tier | ilvl gate | Weight | Share at ilvl 60 | Share at ilvl 72+ |
|---|---:|---:|---:|---:|
| S4 | 1 | 100 | 52.6 % | 50.0 % |
| S3 | 30 | 60 | 31.6 % | 30.0 % |
| S2 | 50 | 30 | 15.8 % | 15.0 % |
| S1 | 72 (M+ only) | 10 | – | 5.0 % |

`RolledAffix.s` holds the S-tier number (4 … 1); the value range comes from the pool table of §3.6. Intra-tier scaling applies as for normal tiers.

### 3.4 Normal pools per equipment slot (slots 1–5; computed from `data/affixes.ts`, 50 affixes)

| Equipment slot | Prefixes | Suffixes | Notable lines that exist **only / mostly** here |
|---|---:|---:|---|
| Kask `helm` | 4 | 18 | `suf_xp_gain`, `suf_magic_find`, `suf_gold_find`, `suf_cast_speed`, `suf_cc_reduction`, `pre_res_max_flat` |
| Omuzluk `shoulders` | 7 | 13 | `pre_dmg_melee/projectile/aoe_pct`, `pre_thorns`, `suf_stagger`, `suf_dodge` |
| Zırh `chest` | 6 | 12 | `pre_hp_pct`, `suf_res_all`, `suf_cc_reduction`, `pre_thorns` |
| Eldiven `gloves` | 15 | 18 | the whole offensive pool: elemental `%`, `suf_attack_speed`, `suf_crit_*`, `suf_life_on_hit`, `pre_armor_pen`, `pre_res_pen`, `suf_stagger` |
| Pantolon `legs` | 3 | 12 | `suf_dodge`, `suf_cc_reduction` |
| Çizme `boots` | 3 | 14 | `suf_move_speed` (boots only), `suf_gold_find`, `suf_magic_find`, `suf_dodge` |
| Kemer `belt` | 3 | 13 | `suf_potion` (belt only), `pre_hp_pct` |
| Kolye `amulet` | 16 | 21 | `suf_all_attr`, `suf_res_all`, `pre_dmg_vs_elite_pct`, `pre_life_steal`, `pre_res_pen`, `suf_xp_gain` |
| Yüzük `ring` | 12 | 22 | `pre_life_steal`, `suf_life_on_hit`, `suf_all_attr`, `suf_res_all`, `suf_xp_gain` |
| Silah `weapon` | 16 | 11 | `pre_wpn_dmg_pct`, `pre_wpn_add_flat` (local), `pre_armor_pen`, `suf_attack_speed`, `suf_crit_damage`, `suf_stagger` |
| Kalkan `shield` | 13 | 13 | `pre_block` (shield only), `pre_armor_local_pct`, `pre_thorns`, `suf_res_all` |
| Kitap `tome` | 8 | 12 | `pre_res_max_flat`, `suf_res_regen`, elemental `%` |

### 3.5 Slot 6: the **Tezgâh** (PoE crafting bench, deterministic)

The player **chooses** the line. Tab **Zanaat → Tezgâh** (the same item slot as the orbs). One crafted line per item, replaced by re-crafting, removable for free.

| Rule | Value |
|---|---|
| Candidate lines | every existing `AffixDef` whose `categories` allow the item, **minus** ids already present on slots 1–5 ("Bu efsun zaten var") |
| Value | `round(0.75 × mid(best non-T0 tier at ilvl))` (§3.3), shown before crafting |
| Cost classes | **A** (cheap): `gold 3,000 + 250·ilvl`, 6 Büyülü Toz, 2 Ejderha Pulu, 2 `orb_chaos`. **B**: `gold 5,000 + 350·ilvl`, 12 Büyülü Toz, 4 Ejderha Pulu, 4 `orb_chaos`. **C**: `gold 8,000 + 500·ilvl`, 20 Büyülü Toz, 8 Ejderha Pulu, 1 Ruh Taşı, 8 `orb_chaos`. At ilvl 60: A 18,000 · B 26,000 · C 38,000 gold |
| Re-craft | same cost again, the old line is lost (no refund) |
| Temizle | free, returns the slot to `null` |
| Locks / orbs | Kaos, Arınma, Nesnesi never touch it |

Cost class per affix id (`BENCH_COST_CLASS` in `data/benchRecipes.ts`, 50 ids):

* **A (22):** `pre_hp_flat`, `pre_armor_flat`, `pre_armor_local_pct`, `pre_res_max_flat`, `pre_thorns`, `suf_str`, `suf_dex`, `suf_int`, `suf_vit`, `suf_res_fire`, `suf_res_frost`, `suf_res_lightning`, `suf_res_shadow`, `suf_res_poison`, `suf_hp_regen`, `suf_res_regen`, `suf_life_on_hit`, `suf_gold_find`, `suf_magic_find`, `suf_cc_reduction`, `suf_potion`, `suf_xp_gain`
* **B (21):** `pre_wpn_add_flat`, `pre_dmg_pct`, `pre_dmg_phys_pct`, `pre_dmg_fire_pct`, `pre_dmg_frost_pct`, `pre_dmg_arcane_pct`, `pre_dmg_poison_pct`, `pre_dmg_melee_pct`, `pre_dmg_projectile_pct`, `pre_dmg_aoe_pct`, `pre_dmg_dot_pct`, `pre_dmg_vs_elite_pct`, `pre_hp_pct`, `pre_block`, `suf_all_attr`, `suf_attack_speed`, `suf_cast_speed`, `suf_res_all`, `suf_move_speed`, `suf_dodge`, `suf_stagger`
* **C (7):** `pre_wpn_dmg_pct`, `pre_life_steal`, `pre_armor_pen`, `pre_res_pen`, `suf_crit_chance`, `suf_crit_damage`, `suf_cdr`

Bench recipes **respect "smart" UX**: the list is sorted by the spec's `ROLE_WEIGHTS` (GDD_LIFE §6.5) and the top 5 are starred.

### 3.6 Slot 7: the **Özel Efsun** pool (Metin2 "special bonus", 24 niche lines)

Values are fractions in data (shown as %); `parryWindow` is seconds; `guardGauge` flat. Slot 7 exists only on **weapon (W)**, **chest (C)** and **amulet (A)** (§3.2), so every line lists which of those three it may roll on. A line whose `stat` is missing from `STAT_IDS` / `STAT_INFO` at runtime is **skipped silently** (GDD_V2 WP1 appends many of these stats; this lets slot 7 ship before them). `staff/wand` = only those weapon categories.

| # | id | TR | stat | Slots | S4 | S3 | S2 | S1 | Tag |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `sp_boss` | Patron Kıran | `bossDamagePct` | W A | 5–8 | 9–13 | 14–19 | 20–26 | melee, caster |
| 2 | `sp_execute` | İnfazcı | `executeDamagePct` | W A | 8–12 | 13–19 | 20–28 | 29–38 | melee |
| 3 | `sp_ailing` | Musibet | `ailingDamagePct` | W A | 6–9 | 10–15 | 16–22 | 23–30 | caster, melee |
| 4 | `sp_aoe_radius` | Genişlik | `aoeRadiusPct` | W A | 5–8 | 9–12 | 13–17 | 18–22 | caster |
| 5 | `sp_cost` | Tutumluluk | `costReductionPct` | W (staff/wand) A | 4–6 | 7–9 | 10–13 | 14–18 | caster, healer |
| 6 | `sp_resgain` | Bereket | `resourceGainPct` | W A | 6–9 | 10–14 | 15–20 | 21–28 | all |
| 7 | `sp_kill_heal` | Yağmacı | `hpOnKillPct` (% max HP) | C A | 0.4–0.7 | 0.8–1.2 | 1.3–1.9 | 2.0–2.8 | tank, melee |
| 8 | `sp_cc_dur` | Boyun Eğdiren | `ccDurationPct` | W A | 8–12 | 13–18 | 19–26 | 27–35 | all |
| 9 | `sp_proj_speed` | Hızlı Ok | `projectileSpeedPct` | W | 10–15 | 16–22 | 23–30 | 31–40 | ranged |
| 10 | `sp_dr` | Demir İrade | `damageReductionPct` | C | 1.5–2.5 | 3–4 | 4.5–6 | 6.5–8.5 | tank |
| 11 | `sp_heal_in` | Şifa Emici | `healReceivedPct` | C A | 6–9 | 10–14 | 15–20 | 21–27 | tank |
| 12 | `sp_rune` | Rün Ustası | `runeEffectPct` | W A | 3–4 | 5–6 | 7–9 | 10–12 | all |
| 13 | `sp_major` | Büyük Çağrı | `majorCdrPct` | C A | 2–3 | 4–5 | 6–7 | 8–10 | all |
| 14 | `sp_flask_gain` | Şişe Dostu | `flaskGainPct` | C A | 8–12 | 13–19 | 20–28 | 29–40 | all |
| 15 | `sp_flask_fx` | Şişe Gücü | `flaskEffectPct` | C A | 5–7 | 8–11 | 12–16 | 17–22 | all |
| 16 | `sp_poise` | Kırıcı | `poiseDamagePct` | W C | 10–15 | 16–23 | 24–33 | 34–45 | melee, tank |
| 17 | `sp_weak` | Zayıf Nokta | `weakDamagePct` | W A | 6–9 | 10–14 | 15–20 | 21–28 | all dps |
| 18 | `sp_finisher` | Cellat Darbesi | `finisherPct` | W | 8–12 | 13–19 | 20–28 | 29–40 | melee |
| 19 | `sp_art` | Silah Ustası | `weaponArtPct` | W | 8–12 | 13–19 | 20–27 | 28–36 | melee |
| 20 | `sp_healing` | Şifa Elleri | `healingPct` | W (staff/wand) A | 4–6 | 7–10 | 11–15 | 16–21 | healer |
| 21 | `sp_threat` | Kışkırtıcı | `threatPct` | C | 5–8 | 9–14 | 15–22 | 23–32 | tank |
| 22 | `sp_guard` | Siper Ustası | `guardGauge` (flat) | C | 4–6 | 7–10 | 11–16 | 17–24 | tank |
| 23 | `sp_parry` | Savuşturucu | `parryWindow` (s) | W C | 0.010–0.015 | 0.016–0.025 | 0.026–0.035 | 0.036–0.050 | tank, melee |
| 24 | `sp_pierce` | Delici Ok | `pierce` (flat) | W (bow, crossbow, wand, staff) | +1 | +1 | +1–2 | +2 | ranged |

Legal lines per equipment slot: **weapon** 16 (1–6, 8, 9, 12, 16–20, 23, 24), **chest** 10 (7, 10, 11, 13–16, 21–23), **amulet** 15 (1–8, 11–15, 17, 20). Pick rule: uniform among the lines legal for the slot, **×2 weight** for lines whose tag matches the owner's role (from `character.spec` role or class fallback); Kader Zarı keeps the same rule. Budget: one S2 roll ≈ 110 BP, S1 ≈ 150 BP (§4.7).

### 3.7 Efsun items and orbs: catalogue, prices, sources

Prices and rates for the V2 orbs are exactly those of GDD_V2 §4.3 (not repeated). New / changed items:

| Item | id | Rule (final) | Vendor / daily limit | Sources |
|---|---|---|---|---|
| Efsun Nesnesi | `efsun_nesnesi` | rerolls slots 1–5 (types + values), keeps count; `gold = 300 + 40·ilvl`; locks 1 → 1 Kilit, 2 → 3 Kilit | 8,000 gold, max 5 / day (shared with the Efsuncu) | existing |
| Efsun Ekleme Nesnesi | `takviye_nesnesi` | adds one random line up to the rarity cap; Normal → Büyülü; **new**: `gold = 600 + 60·ilvl` | Av Mührü 15 (existing) | Seçkin 1 %, Patron 10 % (existing) |
| Efsun Güçlendirme Nesnesi | `kadim_efsun` | rerolls numeric values inside current tiers; slots 1–5 **and 7** | existing | Patron 5 % (L50+), M+ chest 20 % |
| Efsun Kilidi | `efsun_kilidi` | locks one line (also protects against Kaos and Arınma) | Av Mührü 40 | M+ chest timed key ≥ 8 (50 %) |
| **Gümüş Efsun Çekirdeği** | `efsun_cekirdegi_6` | opens slot 6 (permanent) | Mühürdar 120 Av Mührü, **1 per week** | M+ boss key ≥ 8: 6 %; M+ chest timed ≥ +8: 5 %; raid boss N 8 % / K 15 % / M 25 % |
| **Altın Efsun Çekirdeği** | `efsun_cekirdegi_7` | opens slot 7 and rolls its Özel Efsun immediately; costs `gold 20,000` at use | Mühürdar 400 Av Mührü, **1 per week** | M+ chest timed ≥ +12: 3 % (+0.4 % per key above 12, cap 8 %); raid boss K 4 % / M 12 %; Efsun Goblini 2 % |
| **Kader Zarı** | `kader_zari` | rerolls slot 7 (type + value); `gold = 5,000 + 150·ilvl` | Mühürdar 60 Av Mührü | Efsun Goblini 25 %; raid boss K 10 % / M 20 %; Günlük Sandık 3 % |
| Oyma Kalemi | `oyma_kalemi` | unchanged (gem sockets) | – | existing |

The "Efsun" tab also shows the live **cost line** (`gold + items`, red when missing) for every button and a **Olası sonuçlar** preview (tier probabilities of §3.3 for the item's ilvl).

### 3.8 Interactions (so nothing breaks)

| Interaction | Rule |
|---|---|
| **+N boost** (`efsunBoost`) | multiplies random lines of slots 1–5, **and** `bench` and `special` (they count as efsun) |
| **Ustalık** | +3 % per rank on **all** lines (§2.8) |
| **Corrupted** (Bozulma) | slots, lines and locks frozen; Tezgâh, cores, Kader Zarı, Aktarma refuse; **+N, Ustalık and gems still work** |
| **Aspects** (GDD_V2 §5.1) | an Aspektli Efsanevi keeps its aspect in every case; `bench` / `special` coexist with the aspect |
| **Set / Tier** | `set` and tier pieces keep their set lines; their bonuses count normally; `bench` / `special` are additive and **not** set-bound |
| **Kilit** | works on slots 1–5 only; one Kilit protects one line against Nesnesi, Kaos and Arınma |
| **Salvage** | cores are consumed on unlock and never returned; `bench` / `special` lines are lost with the item (only gems return, as today) |
| **Quality / Mühür** (§4.2) | computed from slots 1–5 and 7 (bench excluded because its value is fixed) |
| **Vendor price** | sell value × `(1 + 0.15 × (slot6 ? 1 : 0) + 0.25 × (slot7 ? 1 : 0))` |
| **Item link snapshot** | includes `bench`, `special`, `mw` (O-IT9) |

### 3.9 Drop-source summary (new items only; per player, personal loot)

| Source | Düşük | Orta | Yüksek | Kutsama | Gümüş Çekirdek | Altın Çekirdek | Kader Zarı |
|---|---:|---:|---:|---:|---:|---:|---:|
| Seçkin | 6 % | – | – | – | – | – | – |
| Patron (dungeon) | 25 % | 8 % | – | – | – | – | – |
| M+ boss (key ≥ 4 / 8) | – | 10 % (≥ 4) | – | – | 6 % (≥ 8) | – | – |
| M+ end chest, timed | – | – | 20 % (≥ +6) | existing (≥ +10) | 5 % (≥ +8) | 3 % + 0.4 %/key > 12 (≥ +12) | – |
| Raid boss N / K / M | – | – | 6 / 12 / 20 % | 0 / 8 / 15 % | 8 / 15 / 25 % | 0 / 4 / 12 % | 0 / 10 / 20 % |
| Efsun Goblini | – | – | – | – | – | 2 % | 25 % |
| Günlük Sandık | 15 % | – | – | existing 10 % | – | – | 3 % |
| Mühürdar (Av Mührü) | 8 | 25 | 120 | 50 | 120 (1 / week) | 400 (1 / week) | 60 |

### 3.10 Efsun Aktarma (P3, optional): move one line

`efsun_aktarma` (Mühürdar 150 Av Mührü, Efsun Goblini 8 %): choose **source** (any item) and **target** (same equipment *category group*: weapon → weapon, armor → armor, jewellery → jewellery) and one source line of slots 1–5; the line moves to the target if the target has a free slot below its cap and does not already have that affix id; **the source item is destroyed** (its other lines too). Value and tier are preserved. Refused for `corrupted`, `bound` → non-bound transfers and for the bench / special slots. It is the answer to "I found a better base but lost my roll" without becoming an infinite reroll machine.

### 3.11 Data and API (details in §7 IT-01 / IT-03)

```ts
// data/currencies.ts (items)
export type CraftVerb = 'rerollAll' | 'rerollOne' | 'addOne' | 'addHigh' | 'removeOne' | 'values' | 'lock' | 'rarity' | 'alchemy'
  | 'corrupt' | 'unlock6' | 'bench' | 'unlock7' | 'rerollSpecial' | 'transfer';
export interface CurrencyDef { id: string; verb: CraftVerb; layer: 'A' | 'B' | 'S'; tab: 'efsun' | 'craft'; name: string; desc: string; icon: string }
export const CURRENCIES: Record<string, CurrencyDef>;           // 20 entries: the 5 existing efsun items + 7 orbs + 3 slot items + oyma + transfer
// data/efsunSpecial.ts
export interface SpecialAffixDef { id: string; name: string; stat: StatId; slots: string[]; tiers: [number, number][] /* S4,S3,S2,S1 */; unit: 'pct' | 'flat' | 'sec'; tags: string[] }
export const SPECIAL_AFFIXES: SpecialAffixDef[];                 // table §3.6
export const S_TIER_GATES = [1, 30, 50, 72] as const, S_TIER_WEIGHTS = [100, 60, 30, 10] as const;
// data/benchRecipes.ts
export const BENCH_COST_CLASS: Record<string, 'A' | 'B' | 'C'>; export const BENCH_COST: Record<'A' | 'B' | 'C', { gold: number; goldPerIlvl: number; toz: number; pulu: number; ruh: number; chaos: number }>;
export const benchValue = (def: AffixDef, ilvl: number): number;         // §3.3
// systems/Crafting.ts
export interface CraftPreview { ok: boolean; reason?: string; gold: number; materials: { id: string; count: number }[]; tierOdds?: { tier: number; pct: number }[]; value?: number }
export interface CraftResult { ok: boolean; reason?: string; item?: ItemInstance; changed?: number[] /* line indices */; slot?: 6 | 7 }
export function previewCurrency(uid: string, currencyId: string, o?: { lock?: number[]; recipe?: string; line?: number }): CraftPreview;
export function applyCurrency(uid: string, currencyId: string, o?: { lock?: number[]; recipe?: string; line?: number }): CraftResult;
export function rollSpecial(item: ItemInstance, rng: RNG, classId?: ClassId, role?: string): RolledAffix | null;
export function benchLine(item: ItemInstance, affixId: string): RolledAffix | null;
```

---

## 4. Borrowed systems and the item-power pyramid

Standing order (ROADMAP batch 4): keep stealing good ideas from other MMOs / ARPGs. The rule for this section is **one lane per idea, nothing that duplicates another layer, every layer capped**. Each system below states what it adds, what it deliberately does *not* do, and where it sits in the pyramid of §4.7.

### 4.1 Ledger

| Source | Original idea | Our name | Pyramid layer | Power | What it does that nothing else does | What we cut to avoid overlap | Prio |
|---|---|---|---|---|---|---|---|
| **Silkroad** Seal of Sun / Moon / Star | glowing grade of a rare item | **Mühür** (Yıldız / Ay / Güneş) | L3, derived from Kalite | 0 BP | a visible, glowing "this roll is special" marker on the ground, in the bag and in the tooltip | not a new rarity (7 rarity ids already exist), not a stat layer | P1 |
| **Lost Ark** quality bar | 0–100 quality on every gear piece | **Kalite** bar | L3 | 0 BP | a number that says *how good are my rolls* and tells you when a Kaos / Güçlendirme is worth it | the bar adds no stats | P1 |
| **Lost Ark** engravings | passive engravings carried by accessories, thresholds 5 / 10 / 15 | **Kazıma** (amulet + rings) | L7 | ≤ 200 BP / char | gives jewellery a role beyond "more stats": build personality | separate from the passive tree (nodes) and Kadim Levha (board) | P2 |
| **Aion** manastones + godstone | extra socket family; a special slot with procs | gems = our manastones (kept); **Tılsım Yuvası** = godstone slot (weapon + chest) | L6 | ≤ 120 BP / stone | tiny on-hit / on-hurt procs without touching skills | aspects transform skills (L8), runes live on skills, Tılsım never does either | P2 |
| **Diablo 4** masterworking | ranked, never-failing affix upgrades | **Ustalık** (post +15) | L2b | ≤ +75 BP / item | a guaranteed, expensive tail for a finished item | replaces the "+16" Bozulma outcome (O-IT1); not a second +N ladder | P1 |
| **PoE** crafting bench | deterministic chosen mod | **Tezgâh** (slot 6) | L4a | ≤ 75 BP / item | "I choose this line", the anti-RNG valve | orbs stay for gambling; the bench never exceeds a good roll (75 % of mid) | P1 |
| **Knight Online** "+" names | coloured plus tokens | **+N renk rozetleri** | cosmetic | 0 | instant read of upgrade level in lists and chat | same colours as the visual tiers (§1.1) | P0 |
| **Metin2** dragon stones | alchemy-made stat stones in a separate window | **Ejderha Taşları** | L9 (character) | ≤ 250 BP / char | a character-bound stat layer fed by alchemy | not item sockets (gems), not a board (Levha) | P3 |
| **BDO** failstacks, **KO** scrolls | see §2 | Talih Birikimi, Yükseltme Kâğıtları | L2 | – | – | – | P0 |

### 4.2 Kalite & Mühür (Lost Ark quality + Silkroad seals, derived and free)

**Kalite (0–100)** is computed, never stored (`systems/Quality.ts`, pure, deterministic):

```
bestMax(affix, ilvl) = max over the affix's tiers with gate <= ilvl of tier.max * (1 + min(0.08, 0.0035 * (ilvl - gate)))     // T0 only when ilvl >= 72
lineQ (random line)   = clamp(rawValue / bestMax, 0, 1)                    // rawValue = stored roll, before +N boost and Ustalık
lineQ (fixed line)    = clamp((v - min) / (max - min), 0, 1)               // legendary / set lines with ranges
lineQ (special, slot7)= clamp(value / (S-tier best max at ilvl), 0, 1)
quality               = round(100 * mean(all lineQ of slots 1-5 + slot 7))   // bench excluded (fixed value); items with no such line: no bar
```

It folds tier *and* roll into one honest number ("how close am I to the best this ilvl can ever give"). Typical values at ilvl 60: random Nadir ≈ 29, random Destansı ≈ 53 (best-3 rule), a hand-built chase item 80+.

| Band | Kalite | Colour | TR |
|---|---|---|---|
| 0 | 0–14 | `#d9534f` red | Zayıf |
| 1 | 15–29 | `#e8c33a` yellow | Vasat |
| 2 | 30–54 | `#4ec45a` green | İyi |
| 3 | 55–74 | `#4aa3ff` blue | Çok İyi |
| 4 | 75–89 | `#b565ff` purple | Mükemmel |
| 5 | 90–100 | `#ff9a2e` orange | Kusursuz |

**Mühür (seal) = the glow of the top three bands, nothing else.** Thresholds are data (`SEAL_THRESHOLDS = [75, 90, 97]`):

| Seal | Kalite | Colour | Tooltip badge | Inventory / stash frame | Ground drop | Sound |
|---|---|---|---|---|---|---|
| **Yıldız Mührü** | ≥ 75 | `#cfe8ff` pale blue-white | "Yıldız Mührü" under the name | slow silver sparkle on the frame (CSS, 2 glints, 3 s loop) | 3 sparkles orbit the loot label | – |
| **Ay Mührü** | ≥ 90 | `#b8a8ff` violet-silver | "Ay Mührü" | violet crescent halo that breathes (4 s) | slow violet ring on the ground beam base | quiet `ann_chime` on pickup |
| **Güneş Mührü** | ≥ 97 | `#ffc84a` gold | "Güneş Mührü" | rotating gold corona (6 s) | gold ring + 6 rays, beam gets a 2× width core | `ann_chime` on pickup and a toast "Güneş Mührü!" |

Seals add **no power** and **no name change** (the name keeps its rarity colour; the seal is a second line). They exist so a player can see a god-roll from across the town and so loot filters get one more rule ("Mühürlü eşyaları her zaman göster"). Because the seal is derived, **Kaos / Güçlendirme / Nesnesi are the verbs that chase it**; no new item is needed. A named unique or set piece is judged on its fixed-line ranges.

### 4.3 Knight Online "+" colours (`plusStyle`)

The item **name** keeps its rarity colour. The **"+N" token** (name suffix, inventory badge, chat link, tooltip header) uses the tier colour of §1.1:

| `+N` | Token colour | Extra |
|---|---|---|
| +1 … +3 | `#e8e8e8` white | – |
| +4 … +6 | `#b8d0ff` steel | – |
| +7 … +8 | `#3fa9ff` blue | – |
| +9 … +11 | `#b14cff` purple | – |
| +12 … +14 | text gradient `#ff4030 → #ffc040` | soft red glow (`text-shadow`) |
| **+15** | animated rainbow text (hue cycle 4 s) | sparkle glints; with Ustalık the token reads `+15 ★★★` (one star per rank) |

Inventory / stash / vendor / character slots show a **top-right pill** "+N" with a tier-coloured border; ≥ +12 the pill glows, +15 animates. API (`data/itemVisuals.ts`): `plusStyle(up: number, mw?: number): { color: string; css: string; anim?: 'flame' | 'rainbow'; stars: number }`.

### 4.4 Tılsım Yuvası (Aion godstone, P2)

A **special proc socket** on **weapon** and **chest** only, separate from gem sockets and not counted in `maxSockets`. `item.tilsim?: string | null` (`null` = open slot, id = the stone).

| Rule | Value |
|---|---|
| Opening | Demirci "Tılsım Oy": `20,000 gold + 1 Ruh Taşı`, once per item, Nadir+, not Kırık (works on corrupted items) |
| Stones | stackable materials `tilsim_<type>_<grade>`, grades 1 Çırak / 2 Usta / 3 Kadim; combine 3 → 1 at the Demirci (1,000 / 10,000 gold, no failure); removal returns the stone (free); overwriting destroys the old stone |
| Sources | Seçkin 0.3 %, Patron 8 %, M+ boss 15 %, raid boss 25 %; Mühürdar: grade 1 for 10 Av Mührü, grade 2 for 60 |
| Cap | proc damage from all Tılsım ≤ 10 % of weapon DPS (checked in the sim page); BP ≤ 120 per stone |

| id | TR | Slot | Grade I | Grade II | Grade III | ICD |
|---|---|---|---|---|---|---|
| `ts_firtina` | Fırtına Taşı | weapon | 3 % on hit → bolt 80 % weapon dmg (lightning) | 4 % → 110 % | 5 % → 150 % | 1.5 s |
| `ts_kor` | Kor Taşı | weapon | 4 % → burn 3 s, 30 %/s | 5 %, 45 %/s | 6 %, 60 %/s | 2 s |
| `ts_buz` | Buz Taşı | weapon | 6 % → 15 % slow 2 s + 1 Üşüme | 8 %, 20 % | 10 %, 25 % | 2 s |
| `ts_kan` | Kan Taşı | weapon | on kill +1.0 % max HP | +1.5 % | +2.2 % | 0.5 s |
| `ts_golge` | Gölge Taşı | weapon | on crit → shadow bolt 20 % weapon dmg | 30 % | 45 % | 1 s |
| `ts_pinar` | Pınar Taşı | weapon | on skill cast +1.0 resource | +1.5 | +2.2 | 1 s |
| `ts_demir` | Demir Taşı | chest | when hit 8 % → +20 % armor 4 s | 10 %, +30 % | 12 %, +40 % | 5 s |
| `ts_ruzgar` | Rüzgâr Taşı | chest | on dodge roll → +10 % move speed 3 s | +14 % | +18 % | 4 s |

Each stone registers a `special` id equal to its `ts_*` id with `params: { grade, chance, coef, icd }`; the combat owner implements the hooks by id exactly like uniques and aspects (no skill modification: that is what aspects are for).

### 4.5 Kazıma (Lost Ark engravings, jewellery only, P2)

| Rule | Value |
|---|---|
| Carriers | amulet, ring1, ring2 |
| Rows per item | Nadir 1, Destansı 2, Efsanevi 2 (Sıradan / Normal / Büyülü: 0). `item.eng?: { id: string; pts: number }[]` |
| Points per row | 3 … 7, weights 30 / 30 / 20 / 12 / 8 % |
| Totals | per engraving id, summed over the three carriers: ≥ 5 → level 1, ≥ 10 → level 2, ≥ 15 → level 3 (cap) |
| Active limit | the **3 highest-level** engravings are active (ties by id), the rest show greyed in the character panel |
| Rerolling | `efsun_nesnesi` rerolls ids and points together with the lines; `kadim_efsun` rerolls the **points only**; **any Kilit ≥ 1 on the item keeps its rows** |
| Budget | ≤ 100 BP per active engraving at level 3, ≤ 200 BP per character (a typical build has two engravings at level 2 ≈ 120 BP) |
| Folding | `StatCalc` adds the stats of each active level; "specials" are not used |

| id | TR | Level 1 / 2 / 3 |
|---|---|---|
| `eng_keskin` | Keskin Pençe | `critDamage` +10 / 20 / 32 % |
| `eng_hiz` | Rüzgâr Nefesi | `attackSpeed` and `castSpeed` +3 / 6 / 10 % |
| `eng_zirh` | Taş Kabuk | `armorPct` +6 / 12 / 20 % |
| `eng_can` | Can Pınarı | `maxHpPct` +3 / 6 / 10 % |
| `eng_direnc` | Gökkuşağı Perdesi | `resAll` +4 / 8 / 13 pp |
| `eng_av` | Patron Avcısı | `bossDamagePct` +4 / 8 / 14 % |
| `eng_guc` | Kudret Mührü | `damagePct` +4 / 8 / 13 % |
| `eng_kalkan` | Siper Yemini | `blockChance` +3 / 6 / 10 pp and `guardGauge` +5 / 10 / 18 |
| `eng_sifa` | Şifa Mührü | `healingPct` +5 / 10 / 18 % |
| `eng_hirs` | Kan Hırsı | `lifeSteal` +0.5 / 1.0 / 1.8 % |
| `eng_kacis` | Gölge Adım | `dodgeChance` +2 / 4 / 7 pp |
| `eng_odak` | Odak Gözü | `resourceRegenPct` +8 / 16 / 28 % and `costReductionPct` +2 / 4 / 7 % |

Row id pick: uniform, ×2 weight for the owner's role (tank: zırh, can, kalkan, direnç; healer: şifa, odak, can; melee: keskin, hız, güç, av, hırs; caster: hız, güç, odak, keskin).

### 4.6 Ejderha Taşları (Metin2 dragon stones, later layer, P3)

A **character-bound** stat layer: the Character panel gets a tab **Ejderha Ruhu** (unlock level 40) with **6 slots**. Each slot accepts one stone `ds_<color>_<grade>`; stones are **not** item sockets (those are gems) and not a board (that is Kadim Levha).

| Colour | TR | Stat | Grade 1 Çiğ | 2 Cilalı | 3 Kusursuz | 4 Kadim |
|---|---|---|---|---|---|---|
| `kizil` | Kızıl | `damagePct` | 0.6 % | 1.1 % | 1.7 % | 2.4 % |
| `mavi` | Mavi | `critChance` | 0.25 pp | 0.45 pp | 0.7 pp | 1.0 pp |
| `yesil` | Yeşil | `maxHpPct` | 0.6 % | 1.1 % | 1.7 % | 2.4 % |
| `sari` | Sarı | `armorPct` | 1.2 % | 2.2 % | 3.4 % | 4.8 % |
| `mor` | Mor | `cdr` | 0.3 pp | 0.55 pp | 0.85 pp | 1.2 pp |
| `siyah` | Siyah | `lifeSteal` | 0.12 pp | 0.22 pp | 0.34 pp | 0.5 pp |

* **Colour bonus:** three or more stones of one colour multiply that colour's stat by **×1.25**. Six different colours grant **"Gökkuşağı Ruhu"**: `allAttr` +8 / 14 / 20 / 28 by the *lowest* grade among the six.
* **Alchemy (Simya):** at the alchemist, combine **3 stones of the same colour and grade** into 1 of the next grade: success 80 % / 60 % / 40 % (grade 1→2 / 2→3 / 3→4); cost gold `2,000 / 10,000 / 40,000` and Büyülü Toz `4 / 10 / 25`; **failure consumes 1 of the 3 stones** and adds +10 pp (max +30) to the next attempt (the Metin2 "alchemy luck" stays visible in the UI).
* **Sources:** open-world Metin stones 6 % (grade 1, random colour), Kalıntı Tüccarı sells grade 1 for 20 `metin_kalintisi` (existing currency), Patron 3 %, M+ boss 8 % (grade 2), raid boss 10 % (grade 3); **grade 4 only by alchemy**.
* **Budget:** six Kadim stones of one colour (+ colour bonus) ≈ `damagePct +18 %` ≈ 130 BP; the best mixed set ≈ 250 BP.

### 4.7 The item-power pyramid and the power budget table

The pyramid, bottom to top. **Each layer has exactly one verb family, one place, one currency family.** BP = budget points of GDD_LIFE §6.2 (one mid-tier affix roll = 100 BP; a 60-level character carries ≈ 4,800 BP on 12 slots).

```
   ▲  L9   character layers (not on items): talents · Kadim Levha ≤ ×1.30 · runes ≤ ×1.6 per skill · Ejderha Taşları ≤ 250 BP
   │  L8   aspects ≤ ×1.15 · sets 2/4/6 pieces ≤ 100/150/250 BP · tier 4pc ≤ ×1.25 (niche)
   │  L7   Kazıma (jewellery) ≤ 200 BP      L6  Tılsım ≤ 120 BP per stone      L5  gems ≤ 1 roll per socket
   │  L4   efsun slot 6 Tezgâh (≤ 75 BP) and slot 7 Özel (≤ 150 BP)
   │  L3   Kalite & Mühür (derived, 0 BP)                L2b Ustalık (≤ +15 % of every line value)
   │  L2   basma +N: weapon ×1 … 2.05, armor ×1 … 1.84, efsun boost ≤ +20 % of random lines
   │  L1   rarity: affix lines 0 / 0 / 150 / 350 / 500 / 550 / 550 BP (Sıradan … Set)
   │  L0   base type and ilvl formula (not changeable)
```

| Layer | Name | Changed where / with what | Reversible | Cap per item | Cap per character | Typical L60 endgame | Theoretical max | Opens |
|---|---|---|---|---|---|---|---|---|
| L0 | Taban (base, ilvl) | not changeable | – | by formula (GDD_SYSTEMS §4.4) | – | reference | – | drops |
| L1 | Nadirlik + efsun lines 1–5 | drop, Efsun Nesnesi / Ekleme, Kaos / Yüceltme / Arınma, Güçlendirme | yes (gold, orbs) | 0 / 0 / 150 / 350 / 500 / 550 / 550 BP | ≈ 4,800 BP (12 slots) | 4,800 | ≈ 6,000 | L15 |
| L2 | Basma +N | Demirci, scrolls, stones | partly (−N on failure) | weapon ×2.05, armor ×1.84, jewellery implicit ×1.5; efsun boost ≤ +20 % of random lines (≤ 100 BP) | one ≤ +15 piece per season is the *intended* ceiling (§2.11) | +250 BP of boost | +960 BP (12 × +15) | L10 (+10…+15 at L30) |
| L2b | Ustalık | Demirci, +15 items | no | ≤ +75 BP (5-line Destansı) | – | +70 BP (3 items, rank 3) | +900 BP | L60 |
| L3 | Kalite & Mühür | derived | – | **0 BP** | – | – | – | L1 |
| L4a | Slot 6 Tezgâh | Gümüş Çekirdek + recipe | yes (re-craft) | ≤ 75 BP | 8 eligible slots ≤ 600 BP | 300 BP (4 items) | 600 BP | L60 content |
| L4b | Slot 7 Özel | Altın Çekirdek, Kader Zarı | yes (reroll) | S2 ≈ 110, S1 ≤ 150 BP | 3 eligible slots ≤ 450 BP | 330 BP | 450 BP | L60 content |
| L5 | Gems (Taşlar) | Demirci sockets (existing) | yes (500 × grade gold) | ≤ 1 roll per socket (GDD_LIFE §6.2) | 12 slots × 1–3 sockets | ≈ 1,000 BP | ≈ 2,000 BP | L1 |
| L6 | Tılsım | Demirci "Tılsım Oy" | yes (remove free) | ≤ 120 BP | weapon + chest ≤ 240 BP | 240 BP | 240 BP | L40 |
| L7 | Kazıma | jewellery rows | yes (Nesnesi / Güçlendirme) | – | ≤ 200 BP (3 active) | 120 BP | 200 BP | L40 |
| L8 | Aspects / Sets / Tier | Kâtip Hakan, Set Ustası | yes | aspect ≤ ×1.15; set ≤ 250 BP at 6 pc; tier 4 pc ≤ ×1.25 niche | – | per V2 §11.1 | per V2 §11.1 | L20 / L60 |
| L9 | Ejderha Taşları | alchemist | yes | – | ≤ 250 BP | 180 BP | 250 BP | L40 |

**Totals of what this document adds on top of rarity, +N, gems and aspects** (L2b, L4, L6, L7, L9): **typical ≈ +1,240 BP (+26 % of the 4,800-BP baseline)**, **theoretical ≈ +2,640 BP (+55 %)**, earned over ≈ 150 – 250 hours of L60 play and gated by gold (Ustalık ≈ 0.6 M gold per item) and weekly cores (1 Gümüş + 1 Altın per week from the Mühürdar). Every layer is **additive or a small proc**; this document introduces **no new "more" multiplier** (the V2 inflation caps of §11.1 stay valid). The M+ HP curve (+10 % HP, +8 % damage per key) remains the dominant pressure.

**Rules that keep the pyramid honest:**

1. One verb family per layer (table above). If a new idea needs the same verb, it must be an *item variant* of the existing verb (the way Yüceltme is the premium "add one").
2. Every layer that adds stats states its BP cap in `data/*` as a constant and the **BP audit** button of `dev/items.html` builds three maxed archetypes (tank, melee, caster) and prints the per-layer BP and the total vs the caps above.
3. `corrupted` (Bozulma) freezes L1 and L4 only; it never blocks L2, L2b, L5, L6.
4. Derived layers (L3) never write to the item.
5. Anything that makes the player weaker (Kırık, destroy) is paired with a visible safety net (Kutsama, scrolls, Acıma) so a layer's risk is always the player's choice.

### 4.8 Parking lot (stolen, not adopted yet; revisit each iteration)

| Source | Idea | Why parked / likely form |
|---|---|---|
| Diablo 4 Occultist | enchant = reroll one affix, **choose between old and new** | "Kaos'a Bakış": a one-undo window on Kaos (P3), needs UI for two candidates |
| Guild Wars 2 Mystic Forge | 4 items → 1 item of a higher tier (random) | "Efsun Ocağı": sink for surplus Nadir drops, 4 Nadir → 12 % Destansı (P3) |
| Lost Ark ability stone / gem cutting | node-by-node success bar with falling odds | candidate for "Tılsım Oy" instead of the flat fee (P3) |
| Path of Exile veiled mods | unveil = pick 1 of 3 mods | "Perde Küresi": a Yüceltme variant that offers 3 lines (P3) |
| Last Epoch forging potential | each craft consumes a hidden budget | an anti-infinite-Kaos cap; evaluate if Kaos farming breaks the economy (P3) |
| Silkroad elixirs / lucky powder | consumable "+chance" per item class | already covered by Yükseltme Kâğıtları |
| New World perks + gypsum | choose a perk, spend a catalyst | covered by the Tezgâh |
| Diablo 4 tempering | skill-themed affix manuals | covered by Özel Efsun (slot 7) and Tezgâh; revisit with weapon arts |
| BDO Cron Stones | stop downgrade | covered by Kutsama and the −3 softening |

---

## 5. Camping and housing (later phase, P3)

Both features are **comfort and identity**, not power: the only stat they add is the 30-minute "Konfor" buff (≈ 100 BP, same category as the rest bonus) and Rested XP. They need the open world (GDD_OPENWORLD), the cookfire station (GDD_LIFE §1.10), the death panel and the town NPC roles to exist; implement after the P0–P2 item work. **P2P rule for both:** nothing here needs an authority. Buffs are computed by the peer that receives them; the only things that cross the net are *visuals* (a camp prop, a house layout snapshot), each owned by the sender and ignored by the receiver when invalid.

**No new key binding is introduced** (V2 §0.4 and GDD_LIFE already use G X V T 6–0 U F1–F5 P L Y): a camp is placed by *using the kit from the bag*, packed and used with `F`; a house is entered with `F` on its door; the edit mode uses the existing free cursor (`Alt`).

### 5.1 Camping ("Kamp kur")

**5.1.1 Items and recipes**

| Item | id | Rule | Source |
|---|---|---|---|
| **Kamp Takımı** | `kamp_takimi` | consumable, stack 20; one kit = one camp (tent + fire + pot) | recipe `rcp_kamp_takimi` (`tailor`, skill ≥ 41, bench `loom`): `3× cloth_2 + 2× plank_pine + 1× ingot_iron + 300 gold`, 6 s; Zanaatkâr Osman sells it for **1,800 gold**; Sisli Vadi camp-hub chests drop 1 (5 %) |
| **Kamp Odunu** | `kamp_odunu` | stack 99; each adds **+5 min** of fuel (cap 30 min total) | recipe `1× log_pine → 2`; Osman 15 gold each |

**5.1.2 Placement rules** (`Camping.canPlace(pos)` returns a Turkish reason when refused)

| Rule | Value |
|---|---|
| Where | **open-world zones only** (`DungeonDef.outdoor`), never in villages' safe boxes, towns, dungeons, raids, PvP zones |
| Distance | ≥ 40 m from a waypoint stone, a village / camp hub, a dungeon entrance, a Metin stone, a world-boss arena; ≥ 15 m from any other camp (also other players' camps); regions may carry a `noCamp` tag |
| Combat | not in combat (10 s since the last damage dealt or taken), no enemy currently aggroed on the player within 40 m |
| Ground | walkable (`NavGrid`), not water |
| Count | **1 active camp per character**; placing a new one packs the old |
| Setup | 5 s channel (`Interact` loop, cancels on move / damage), tent 3 m in front of the player, fire at the player's feet, pot 1.4 m beside the fire |
| Pack up | `F` on the tent, 3 s, nothing refunded, except **undo within 20 s of placing** (kit refunded) |
| Persistence | a camp exists only while its owner stays in the scene; leaving the scene, logging out or dying far away does **not** remove it for 30 s, then it expires; **never saved** |

**5.1.3 Entities** (`CampSite` interactable group, scenes module; models exist): `gen/props/tent.glb` (rest), `gen/props/campfire.glb` (flame cards, `fire_fx`, `light_0`), `gen/props/cauldron.glb` (the pot, a `PanelProp` with `crafting { station: 'cookfire' }`, range 5, so all 12 food recipes of GDD_LIFE §1.11-E work at a camp). VFX `camp_light` (LightPool slot, `0xff7a2a`, radius 11, flicker), `camp_smoke` (slow grey puffs), SFX `camp_crackle` (loop, 12 m).

**5.1.4 Effects (everything inside the 8 m "Kamp Alanı" of any camp of the party)**

| Effect | Rule | Numbers |
|---|---|---|
| **Dinlenme** (rest) | out of combat for 6 s: HP regen ×3, resource regen ×2; sitting (`/otur`) or lying (`/uyu`) stacks with the existing emote bonus up to ×4 | base 0.04 max-HP/s → 0.12 |
| **Kamp Konforu** (rest buff) | after **60 s of cumulative rest** in a camp area: 30 min buff `maxHpPct +0.05`, `hpRegen +2`, `resourceRegenPct +0.10`; does not stack with food (own category "Dinlenme"); refreshed by resting again; lost on logout (`flags['buff.rest']` stores the remaining time like food) | ≈ 100 BP |
| **Dinlenmiş XP** (rested XP) | while resting in a camp area (or a house bed, §5.2.5): `+1 %` of `xpToNext` per minute into the pool, pool max **25 %** of one level; every kill's XP gets **+100 %** until the pool is drained (the extra is taken from the pool) | stored in `CharacterSave.camp.rested` (fraction 0 … 0.25); XP bar draws the pool as a lighter segment; not active in M+ |
| **Cooking** | the pot opens `crafting { station:'cookfire' }` (food buffs, 30–60 min) | – |
| **Respawn point** | while the owner's camp is lit and the owner is in the same scene, the death panel gets a third button **"Kampta Dirilt"** (50 % HP, 3 s immunity) beside "Işınlanma Taşında" and "Burada Diril"; using it costs **3 min of fuel** (if less is left the camp goes out after the respawn); other party members can use the owner's camp too | – |
| **Ateş korkusu** (optional P3b) | `beast` and `insect` family enemies of level ≤ player + 5 have their aggro radius ×0.7 against players inside a camp area | – |
| Party | the 8 m area of **every** party member's camp applies to everyone in range; effects of overlapping camps do not stack | – |

**5.1.5 Duration and fuel.** Initial fuel **15 min**; each Kamp Odunu adds 5 min (cap 30). The pot and the rest area work while the fire is lit. The fire dims during the last 60 s (light radius 11 → 5, "Kamp sönüyor" toast at 60 s), then `camp:expired` removes the props with a smoke puff. Fuel ticks in real time while the owner is online in the scene.

**5.1.6 Net (`camp` channel, owner = scenes, sender + receiver).** Owner → all: `{ o: EntityId; k: 1 | 0; x: number; z: number; f: number }` (`k` 1 = placed / refuelled with `f` seconds of fuel left, 0 = removed). Receivers instantiate a **visual-only** `CampSite` (no panels except the pot's local crafting panel) and compute the rest radius against it. A peer that joins late sends `{ t: 'req' }` on the same channel; owners answer with a current `k:1`. Payload < 40 bytes; rate limit 1 per second per owner. A forged camp can only give *its* receiver a rest bonus, which is harmless.

**5.1.7 UI.** HUD chip next to the buff bar "Kamp 12:40" (tent icon, click = nothing); minimap marker `camp` (tent icon, party members' camps in blue); interaction prompts `F`: "Dinlen" (sit), "Pişir" (pot), "Odun at" (+5 min, uses a Kamp Odunu), "Kampı topla"; the XP bar shows the rested pool; inventory tooltip of the kit: "Açık dünyada çadır kurar. 15 dk dinlenme, yemek ve diriliş noktası."

### 5.2 Housing ("Ev satın al")

**5.2.1 Houses (one per character, three tiers)**

| id | TR | Where (door) | Req. level | Price | Interior (`DungeonDef`) | Deco slots | Ev Sandığı (home stash) | Station slots | Mannequins | Trophy plaques |
|---|---|---|---:|---:|---|---:|---:|---:|---:|---:|
| `home_kulube` | **Köy Kulübesi** | Gümüşdere Köyü, the "Köylü Evi 3" at (−35, −4), door facing east | 10 | 25,000 | 12 × 8 m, 1 room | 24 | 30 | 2 | 1 | 6 |
| `home_karakol` | **Karakol Evi** | Kızılkaya Karakolu, "Karakol Evi 1" at (−24, −15) | 20 | 120,000 | 16 × 12 m, 2 rooms | 48 | 60 | 3 | 2 | 12 |
| `home_konak` | **Kuzgunkale Konağı** | Kuzgunkale, new building at the west edge of the Han Bahçesi, suggested door (14, 40) rot 90 (nudge ≤ 2 m, verify in `dev/world.html`) | 40 | 600,000 | 24 × 16 m, 3 rooms (Salon, Atölye, Şeref Salonu) | 96 | 90 | 4 | 4 | 24 |

* **Buying:** **Emlakçı Rıza** (new NPC, role `'home'`, in Kuzgunkale and next to each village's Muhtar) opens panel `home`, tab "Satın Al". Gold only. **Moving:** selling returns **50 %** of the price; placements reset, **owned furniture is kept**. A character may own one house at a time.
* **Door:** an interactable `HouseDoor` on the village building (prompt "Eve gir [F]"); only the owner's house door is active; other characters' doors are not a thing (houses are per character and per save, §5.2.7).
* **Interior scene:** a `DungeonDef` (`id: 'home_kulube' …`, `outdoor: false`, rooms as above, no packs, no bosses, `difficulty: 'normal'`, `home: true` flag), built by the existing `DungeonBuilder` with warm interior lighting and KayKit Furniture Bits props; an exit portal "Çıkış Kapısı" returns the party to the door (`DungeonParams.returnTo`). `G.mplus` is never begun; M+ HUD stays hidden.

**5.2.2 Decoration.** The **Dekor Defteri** (a book prop at the entrance, `F`) opens panel `home`. Tabs: *Dekor* (edit mode), *Mağaza* (buy furniture), *Kupalar*, *Satın Al / Taşın*. Edit mode:

| Control | Behaviour |
|---|---|
| Place | pick a prop in the catalogue → a ghost follows the free cursor (`Alt`), snaps to a **0.5 m grid**, green when legal, red when overlapping a wall, a door or another prop |
| Rotate | Q / E in 90° steps, mouse wheel on the ghost |
| Move / remove | click a placed prop to lift it; `R` or the bin icon removes it (the prop returns to the owned pool, free) |
| Limits | each placed prop costs `slots` (1 for small, 2 for large furniture, 3 for stations / mannequin); total ≤ the house's deco slots |
| Save | on leaving edit mode and on every 30 s; `CharacterSave.home.decor` |
| Undo | one level (Ctrl+Z is not used by the game; the panel has an "Geri al" button) |

**5.2.3 Furniture catalogue** (`data/homeProps.ts`; models already in `public/assets/models/`; footprints in metres; `slots` = deco cost; prices in gold; `vendor` = Emlakçı Rıza, `craft` = `wood` / `tailor` / `smith` recipe, `boss` = trophy reward, `event`)

| id | TR | Model | Footprint | Slots | Price | Source |
|---|---|---|---|---:|---:|---|
| `hp_bed_single` | Tek Kişilik Yatak | `furniture/bed_single_A.glb` | 1.6 × 3.0 | 2 | 800 | vendor |
| `hp_bed_double` | Çift Kişilik Yatak | `furniture/bed_double_A.glb` | 3.1 × 3.0 | 2 | 2,500 | vendor |
| `hp_table_medium` | Masa | `furniture/table_medium.glb` | 2.0 × 1.2 | 1 | 600 | vendor |
| `hp_chair` | Sandalye | `furniture/chair_A_wood.glb` | 0.9 × 0.9 | 1 | 150 | vendor |
| `hp_stool` | Tabure | `furniture/chair_stool_wood.glb` | 0.7 × 0.7 | 1 | 80 | vendor |
| `hp_couch` | Kanepe | `furniture/couch_pillows.glb` | 2.6 × 1.2 | 2 | 900 | vendor |
| `hp_armchair` | Koltuk | `furniture/armchair_pillows.glb` | 1.3 × 1.3 | 1 | 500 | vendor |
| `hp_shelf` | Kitaplık | `furniture/shelf_B_large_decorated.glb` | 2.0 × 0.6 | 2 | 700 | vendor |
| `hp_cabinet` | Dolap | `furniture/cabinet_medium_decorated.glb` | 1.4 × 0.8 | 1 | 650 | vendor |
| `hp_rug_oval` | Oval Halı | `furniture/rug_oval_A.glb` | 3.0 × 2.0 | 1 | 300 | vendor |
| `hp_rug_stripes` | Çizgili Halı | `furniture/rug_rectangle_stripes_A.glb` | 3.0 × 2.0 | 1 | 300 | vendor |
| `hp_lamp` | Ayaklı Lamba | `furniture/lamp_standing.glb` (light `0xffe0b0`, r 6) | 0.5 × 0.5 | 1 | 400 | vendor |
| `hp_picture` | Büyük Tablo | `furniture/pictureframe_large_A.glb` (wall) | 1.4 × 0.1 | 1 | 350 | vendor |
| `hp_books` | Kitap Yığını | `furniture/book_set.glb` | 0.4 × 0.4 | 1 | 120 | vendor |
| `hp_barrel` | Fıçı | `gen/props/barrel.glb` | 0.8 × 0.8 | 1 | 100 | vendor |
| `hp_crate` | Kasa | `gen/props/crate_a.glb` | 1.0 × 1.0 | 1 | 100 | vendor |
| `hp_brazier` | Mangal | `gen/props/brazier.glb` (flame, light) | 1.2 × 1.2 | 1 | 1,200 | vendor |
| `hp_banner` | Sancak (mavi / yeşil / kızıl) | `gen/props/banner_*.glb` | 1.7 × 0.7 | 1 | 600 | vendor, red from M+ rating 1,000 |
| `hp_dummy` | Talim Mankeni | `gen/props/training_dummy.glb` (hits show damage numbers, no loot) | 1.0 × 1.0 | 2 | 2,000 | vendor |
| `hp_statue` | Kapüşonlu Heykel | `gen/props/statue_hooded.glb` | 1.2 × 1.2 | 2 | 3,500 | event |
| `hp_crystal` | Kristal (mavi / mor) | `gen/props/crystal_*.glb` (emissive) | 0.8 × 0.8 | 1 | 1,500 | craft (`jewel`) |
| `hp_wood_plank` | Ahşap Zemin Parçası | `kenney/*` floor module | 2 × 2 | 1 | 200 | craft (`wood`) |
| **Stations** | | | | | | |
| `hs_forge` | Ev Ocağı | `gen/props/forge.glb` + `anvil.glb` → `crafting { station:'forge' }` | 2.4 × 1.6 | 3 | 12,000 | vendor |
| `hs_alchemy` | Ev Simya Masası | `gen/props/alchemy_table.glb` → `alchemy` | 1.9 × 0.9 | 3 | 9,000 | vendor |
| `hs_cook` | Ev Mutfağı | `gen/props/campfire.glb` + `cauldron.glb` → `cookfire` | 2.7 × 1.7 | 3 | 6,000 | vendor |
| `hs_bench` | Ev Tezgâhı (prof seçilir) | `kenney/survival-kit/workbench.glb` → `workbench { prof }` | 1.8 × 0.9 | 3 | 7,000 | vendor |
| `hs_fountain` | Şişe Çeşmesi | free flask refill (GDD_V2 §4.2) | 1.2 × 1.2 | 3 | 4,000 | vendor |
| **Special** | | | | | | |
| `hx_stash` | Ev Sandığı | `gen/props/chest_iron.glb`, opens the **owner's** home stash | 1.2 × 0.8 | 1 | free (first) | tier |
| `hx_depo` | Depo Sandığı | `gen/props/chest_wood.glb`, opens **the viewer's own** regular stash (also for visitors) | 1.2 × 0.8 | 1 | 1,000 | vendor |
| `hx_mannequin` | Zırh Mankeni | a `loadCharacterModel` clone in `Unarmed_Pose`, wearing the owner's equipped gear (shows the armor glow, §1) | 1.0 × 1.0 | 3 | 15,000 | vendor |
| `hx_weaponrack` | Silah Askısı | shows the equipped weapon / off-hand with its weapon glow | 1.6 × 0.5 | 2 | 8,000 | vendor |
| `hx_trophywall` | Kupa Panosu | 3 × 2.4 m board that shows the trophy plaques (§5.2.4) | 3.0 × 0.3 | 2 | 5,000 | vendor |
| `hx_bed` | (any `hp_bed_*` marked "yatak") | `F` = "Yat" (`Lie_Down`): rested XP ×1.5, sets **Ev** as a respawn option, grants Kamp Konforu after 60 s | – | – | – | – |

**5.2.4 Trophies.** `CharacterSave.home.trophies: Record<bossId, number>`, a bitmask of the **first kills** per difficulty: 1 Normal, 2 Kahramanlık, 4 Mitik, 8 Mitik+ timed (≥ +10), 16 / 32 / 64 raid Normal / Kahramanlık / Mitik. Written by `run:completed` and `boss:defeated` for every boss in `BOSSES` plus the five `rd_*` raid bosses (GDD_V2 §9). The Kupa Panosu draws one plaque per entry (a `CanvasTexture` with the boss name, a coloured gem per difficulty, the date). Plaques are free; only the board costs gold. Trophy plaques are **display-only**: no stats.

**5.2.5 Rest, stash, stations, fountains.** Everything works **locally for whoever stands in the house**: crafting panels use the visitor's own skills and materials, `hx_depo` opens the visitor's stash, the fountain refills the visitor's flasks. Only the **Ev Sandığı** (owner's home stash, a second stash tab "Ev" of 30 / 60 / 90 slots saved as `CharacterSave.home.stash`) and the **bed respawn** are owner-only. Rested XP and Kamp Konforu inside a house follow the camp rules (§5.1.4), in a bed ×1.5.

**5.2.6 Ev Taşı (hearthstone).** `ev_tasi` is granted free with the deed and replaceable at Emlakçı Rıza (never lost). Use: 10 s channel, **30 min cooldown**, open world and towns only (not dungeons, raids, M+, combat); teleports **the user alone** to the house door. The death panel offers "Evde Dirilt" (the house door, 50 % HP, free) when a house exists.

**5.2.7 P2P constraints.**

| Constraint | Design answer |
|---|---|
| No server, saves are local | the house belongs to a **character save** (`CharacterSave.home`), exists only for its owner; there are no public or neighbour houses |
| Visiting | the **party visits together**: the owner opens the door (as host or via `G.net.requestSceneFromHost('dungeon', { dungeonId: 'home_…', homeOwner: peerId, returnTo })`, same flow as the keystone owner), every peer loads the interior; any peer can leave with the exit portal |
| Layout transfer | after `sceneReady` the owner sends `home` messages (below); visitors build **the owner's** decoration, read-only; late joiners send `{ t: 'req' }` |
| Authority | none needed: placements are visual, stations / stash are local, trophies are display-only; a forged snapshot can only decorate the forger's own visitors |
| Message size | placements are packed as `[propIndex, gx, gz, rot]` (`gx = round(x / 0.5)`), ≤ 120 entries ≈ 1.9 KB; mannequins and trophies in separate messages; every `home` message ≤ 4 KB, otherwise chunked (`part: i/n`) |
| Validation | `propIndex` must exist in `HOME_PROPS`, `gx, gz` inside the room bounds, ≤ the tier's slot cap, rotation 0–3; invalid entries are dropped (never throw) |

`NetChannels.home`: `{ o: EntityId; t: 'deco' | 'mq' | 'tro' | 'req'; tier?: string; p?: number[][]; mq?: { cls: ClassId; v: number; g: Record<string, CompactItem> }[]; tr?: Record<string, number>; part?: [number, number] }`.

**5.2.8 Save shape** (`CharacterSave.home`, optional, ≤ 8 KB JSON): `{ tier: 'home_kulube' | 'home_karakol' | 'home_konak'; boughtAt: number; decor: [propIndex, gx, gz, rot][]; owned: Record<propId, number>; trophies: Record<string, number>; stash: (ItemInstance | null)[]; mannequins: { slot: number; hide?: boolean }[]; bedRespawn: boolean }`.

**5.2.9 Economy.** One-off costs only (no rent, no upkeep): Kulübe 25 k, Karakol 120 k, Konak 600 k gold; fully furnishing a Konak with 4 stations, 2 mannequins, board ≈ 120 k more. At 70 – 90 k gold per hour that is **a ≈ 10-hour goal** at L40 – 60, a pure gold sink with a social payoff. Everything that matters for power (stats) stays outside the house.

### 5.3 Data and API (details in §7 IT-50 … IT-59)

```ts
// types/itemsV2.ts (core)
export interface CampState { rested: number; hearthAt: number }                                  // CharacterSave.camp (rested = fraction of xpToNext, 0..0.25)
export interface HomeSave { tier: string; boughtAt: number; decor: number[][]; owned: Record<string, number>; trophies: Record<string, number>; stash: (ItemInstance | null)[]; mannequins: { slot: number; hide?: boolean }[]; bedRespawn: boolean }
// data/camp.ts (items): KAMP = { initialFuelSec: 900, woodSec: 300, maxFuelSec: 1800, radius: 8, restDelaySec: 6, comfortAfterSec: 60, comfortSec: 1800, respawnFuelCostSec: 180, placeMinDist: { waypoint: 40, village: 40, entrance: 40, metin: 40, boss: 40, camp: 15 }, restedPerMin: 0.01, restedMax: 0.25, restedXpBonus: 1.0 }
// data/homeProps.ts (items): HOME_TIERS, HOME_PROPS (index = propIndex in snapshots, append-only), TROPHY_BITS
// scenes/Camping.ts: canPlace(pos), place(kitId), pack(), refuel(), update(dt)
// systems/Housing.ts (items): buyHouse(tier), sellHouse(), buyProp(id), place(propIndex, gx, gz, rot), remove(i), snapshot(): HomeSnapshot, validateSnapshot(raw): HomeSnapshot | null
```

---

## 6. UI changes

### 6.1 Blacksmith panel redesign (`blacksmith`, panels-items)

**Structure.** The 1,049-line `BlacksmithPanel.ts` becomes a thin shell plus one module per tab (a pure move first, package IT-30), so tabs can be changed by different agents without touching each other. New size: `width 780, height 640` (was 716 × 610). Tabs, in order: **Yükselt · Efsun · Zanaat · Taş Yuvası · Parçala**. `blacksmith` data accepts `{ tab?: 'up' | 'efsun' | 'craft' | 'socket' | 'salvage', uid?: string }` (`craft` = the V2 "Zanaat" tab; the Zanaat Tezgâhı interactable and Efsuncu Nergis open it).

```
┌ Demirci ─────────────────────────────────────────────────────────────────────────────────── ✕ ┐
│ [ Yükselt ] [ Efsun ] [ Zanaat ] [ Taş Yuvası ] [ Parçala ]                                      │
├────────────────────────┬────────────────────────────────────────────────────────────────────────┤
│  STAGE (300 × 336)     │  Çelik Zırh  +9   (name = rarity colour, "+9" = tier colour, ★ = Ustalık)│
│  anvil, heat, hammer,  │  Zırh · Eşya Seviyesi 60     Kalite 62 ▮▮▮▮▮▮▯▯▯▯   [Yıldız Mührü]        │
│  ForgeFx canvas,       │  Efsun ● ● ● ● ○  ◇  ◆                                                    │
│  item slot (xl)        │ ───────────────────────────────────── YÜKSELT ─────────────────────────── │
│                        │  +9 ➜ +10                                                                  │
│  [Basma Günlüğü ▾]     │  Başarı  ▓▓▓▓░░░░░░  Taban %30 · Talih +%13.8 · Kâğıt +%10 = %53.8         │
│  last 5 attempts       │  Talih 23 / 60  ▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▯▯▯▯  [ Taş ▾ ]   Kader ▲ 60        │
│                        │  Kâğıt   (•) Yok  ( ) Düşük  ( ) Orta (3)  ( ) Yüksek (0)                  │
│                        │  Koruma  [ ] Kutsama Kağıdı (2)          (el) Demirci acıması hazır          │
│                        │  Başarısız olursa:  EŞYA YOK OLUR!  (Orta ile: seviye −3)                  │
│                        │  Önizleme  +10 Yükseltme: +%50 zırh, efsunlar +%5                          │
│                        │  Maliyet   26,000 altın · 8 Büyülü Toz · 4 Ejderha Pulu · 1 Ruh Taşı       │
│                        │                         [          YÜKSELT          ]                      │
├────────────────────────┴────────────────────────────────────────────────────────────────────────┤
│ Dükkân şeridi:  Kara Demir · Büyülü Toz · Ejderha Pulu · Düşük Kâğıt · Efsun Nesnesi · ...  (buy) │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Yükselt tab details**

| Element | Behaviour |
|---|---|
| Header | name in the rarity colour; the `+N` token in the tier colour (§4.3); `★` per Ustalık rank; second line type · Eşya Seviyesi (efektif N); Kalite bar + Mühür badge when present; **efsun pips** (5 round, silver, gold: filled / hollow / dimmed = locked) |
| Başarı bar | three-segment stacked bar (Taban grey, Talih blue, Kâğıt gold); text `Taban %30 · Talih +%13.8 · Kâğıt +%10 = %53.8`; colour by total (`chanceColor`); a `KADER` flag replaces it when the pity threshold is armed ("Kader Eşiği: bu deneme GARANTİ") |
| Talih | bar `stacks / 60` with notches at 10 / 20 / 30 / 40 / 50 and a gold marker at 60 ("Kader"); a **Taş ▾** drawer (§2.4): *Taşa Aktar* (size picker + fee), *Taştan Yükle* (owned stones), *Satın Al* (price, daily limit), *Sat*; the drawer is disabled while an animation runs |
| Kâğıt | four radio tiles with icon, owned count, chance bonus and a one-line softening text ("−1 yerine seviye korunur"); tiles not usable for the target are greyed with the reason |
| Koruma | Kutsama Kağıdı toggle (existing `toggleRow`); the **Acıma** icon appears when `destroyStreak ≥ 2` |
| Failure line | one of: `Başarısız olursa: seviye korunur.` / `seviye 1 düşer!` / `EŞYA YOK OLUR!` (red) / `EŞYA KIRILIR (onarılabilir)` (orange, bound items) / `seviye −3 düşer` (Yüksek / Acıma) / `seviye korunur (Kutsama)`; always reflects the chosen scroll and protection |
| Preview | existing `describe(...).upgradeLine` before / after |
| Cost | gold + materials rows (`matRow`, red when missing) |
| Button | `YÜKSELT`; disabled when a cost is missing or `busy`; runs the ceremony of §2.9 |
| **+15 mode** | when `upgrade === 15`: the whole column switches to **Ustalık**: rank pips ① … ⑤, effect text "+%3 tüm efsunlar / rank", the cost of the next rank, button `USTALIK YAP` (same ceremony, gold-white palette, always `BAŞARILI`) |
| **Kırık mode** | a broken item shows only "KIRIK" and the repair cost with the `ONAR` button |
| Günlük | the *Basma Günlüğü* drawer under the stage lists the last 5 (expandable to 20) attempts |

### 6.2 Efsun tab

```
┌ item header (as above) ──────────────────────────────────────────────────────────────────────┐
│ Efsunlar            Kilit: 1 / 2  (Efsun Kilidi ×3)                                           │
│ ① [K] +%32 Kritik Hasarı           T2 ▮▮▮▯   %78                                              │
│ ②    +%14 Ateş Hasarı             T3 ▮▮▯▯   %41                                              │
│ ③    +12 Güç                      T4 ▮▯▯▯   %28                                              │
│ ④    +%8 Saldırı Hızı             T2 ▮▮▮▯   %70                                              │
│ ⑤    (boş)                                                                                      │
│ ◇⑥ Tezgâh: +%26 Kritik Hasarı     [ Temizle ]            ← silver                            │
│ ◆⑦ Özel (S2): +%19 Patron Hasarı  [ Kader Zarı ×1 ]      ← gold                              │
├───────────────────────────────────────────────────────────────────────────────────────────────┤
│ [ Tümünü Çevir ]  Efsun Nesnesi ×1 · Kilit ×1 · 2,700 altın          Olası sonuçlar ▾            │
│ [ Efsun Ekle   ]  Efsun Ekleme ×1 · 4,200 altın                                                  │
│ [ Güçlendir    ]  Efsun Güçlendirme ×1 (yalnız değerler)                                       │
│ [ 6. Yuvayı Aç ]  Gümüş Efsun Çekirdeği ×1            [ 7. Yuvayı Aç ] Altın Çekirdek ×1 · 20,000 │
└───────────────────────────────────────────────────────────────────────────────────────────────┘
```

* The **`EfsunList`** widget (new, `blacksmith/EfsunList.ts`, also used by the Zanaat tab) draws up to 7 rows: tier ticks, the per-line **quality %** (§4.2), padlock toggle (click = lock, max 2, shows the Kilit cost), a hover tooltip with the tier range and the intra-tier scaling. Rows 6 and 7 are visually distinct (silver / gold diamond, own colour).
* Every button is a *card*: verb, item name, owned count, gold, a live "yetersiz" state, and a **Olası sonuçlar** popover (tier odds from §3.3 for this ilvl, S-tier odds for the special slot, locked lines listed as "korunur"). No button acts on an item that is not valid; the reason is printed on the card ("Destansı eşyalara 7. yuva açılabilir").
* Result feedback: the changed rows flash (new = gold, upgraded value = green, downgraded = red) for 900 ms; stage plays the **magic** variant (`res-magic`, purple flash) already used today; sound `upgrade_success` (soft) for Kader / Çevir.
* Engraving rows (jewellery, §4.5) appear under the lines as "Kazımalar" with their points; **Çevir** and **Güçlendir** state in their popover what happens to them.

### 6.3 Zanaat tab (orbs + Tezgâh)

| Area | Content |
|---|---|
| Left: orb shelf | six orbs (Kaos, Yüceltme, Arınma, Şans, Simya, Bozulma) as slots with count; click selects, a selected orb shows its rule, odds preview and a **line picker** (Kaos / Arınma pick the line, or "rastgele") |
| Centre: `EfsunList` | the same widget as the Efsun tab (locks respected) |
| Right: **Tezgâh** sub-tab | recipe list (affixes legal for the item minus the ones already present), search box, role-sorted with a ★ on the top 5; selecting shows the **fixed value**, the cost class and the full cost (gold / Toz / Pulu / Ruh / Kaos); button `TEZGÂHTA YAP`; "Temizle" |
| Bozulma | needs a confirm dialog "Bu işlem geri alınamaz" (existing `G.ui.confirm`) |

### 6.4 Tooltip line order (final, `common.ts` `fallbackItemHTML` and the item tooltip builder)

1. **Name** in the rarity colour, then the `+N` token in the tier colour, `★` per Ustalık rank (chat links and slot badges use the same `plusStyle`)
2. **Sub-line**: type · `Eşya Seviyesi 60` (and `(efektif 66)` when upgraded, GDD_LIFE §6.3)
3. **Badge row**: `KIRIK` (red) · `Ruha Bağlı` · **Mühür** (Yıldız / Ay / Güneş, seal colour) · `Bozulmuş` (grey)
4. **Kalite bar** `Kalite 62  ▮▮▮▮▮▮▯▯▯▯  Çok İyi` in the band colour
5. Damage / armor block and the `+N Yükseltme: …` line (existing)
6. Implicit lines
7. **Efsun pips** `● ● ● ● ○  ◇  ◆` (5 round pips filled by line count, silver = slot 6, gold = slot 7; hollow = open and empty; dim = locked/not available)
8. Affix lines of slots 1–5 with tier tag and padlock (existing `affixLines`)
9. **Tezgâh** line (silver diamond): `Tezgâh: +%26 Kritik Hasarı` or `Tezgâh yuvası: boş`
10. **Özel** line (gold diamond): `Özel (S2): +%19 Patron Hasarı`
11. **Kazıma** rows (jewellery): `Kazıma: Keskin Pençe · 6 puan`
12. Socket lines (gems)
13. **Tılsım** line: `Tılsım: Fırtına Taşı III — %5 şansla yıldırım (150 %)` or `Tılsım yuvası: boş`
14. Special lines (unique effects, aspects, set bonuses) in orange / set colour (existing)
15. **Ustalık**: `Ustalık V · tüm efsunlar +%15`
16. **Glow line**: `Kızıl-Altın Alev parıltısı` (the tier name of §1.1)
17. Flavor, set pieces list, sell price, compare arrows (existing, GDD_LIFE §6.5)

`ItemDescription` (in `systems/ItemGen.ts`, owned by items) gains optional fields: `plus?: { n: number; color: string; stars: number }`, `badges?: string[]`, `quality?: { q: number; band: number; bandName: string; seal: 0 | 1 | 2 | 3 }`, `pips?: { normal: number; max: number; bench: 'locked' | 'open' | 'filled'; special: 'locked' | 'open' | 'filled' }`, `benchLine?: string`, `specialLine?: string`, `engravingLines?: string[]`, `tilsimLine?: string`, `masterwork?: string`, `glowName?: string`, `broken?: boolean`. The panel code only renders what exists.

### 6.5 Other panels, HUD and widgets

| Where | Change | Owner |
|---|---|---|
| Inventory / stash / vendor / character slots (`ItemSlot` in `common.ts`) | top-right `+N` pill in the tier colour (glow ≥ +12, animation +15), seal frame classes `seal-star / seal-moon / seal-sun`, a tiny red crack overlay for Kırık, quality dot (band colour) bottom-left when the loot filter option "Kalite noktası" is on | panels-items |
| Character panel (`CharacterPanel.ts`) | header "Eşya Seviyesi" (GDD_LIFE), new line **Zırh Parlaklığı: Mor Rünler (ort. +9.3)** with a mini-icon strip of the six slots, the **Efsun Özeti** (count of open / filled 6th and 7th slots), the **Kazımalar** list with `puan / eşik` (`Keskin Pençe  8 / 10`), the **Tılsım** summary, the *Ejderha Ruhu* tab (P3), "Kaskı gizle" unchanged | panels-items |
| Character preview | shows the armor shader (no particles), updates when equipment changes; the +15 prism is visible in the preview while hovering a +15 item (preview-on-hover is P2) | panels-items + player |
| HUD banner `Announce.ts` | top-centre strip: gold (+12…+14, 2.5 s) or rainbow "DUYURU" (+15, 6 s), item name in rarity colour, `ann_chime` | hud |
| HUD XP bar | lighter segment = Rested XP pool (P3) | hud |
| HUD buff bar | `Kamp Konforu`, `Dinlenme` icons; chip "Kamp 12:40" (P3) | hud |
| Death panel | extra buttons "Kampta Dirilt" / "Evde Dirilt" when available (P3) | panels-game |
| Settings | Grafik: *Zırh Parlaması* (Kapalı / Düşük / Yüksek); Oyun: *Hızlı Basma* (animasyonu kısalt) | panels-game |
| Loot labels (`LootDrop.ts`) | Mühür sparkle / ring, label suffix `(Yıldız Mührü)`; `+N` never appears on ground items | items |
| Chat links (GDD_LIFE §3.5) | token `[Çelik Zırh +12]` with tier colour; the hover tooltip shows the new lines | hud + net |
| `home` panel (P3) | tabs *Dekor · Mağaza · Kupalar · Satın Al* | panels-game |

### 6.6 Turkish string catalogue (new, keep consistent)

`Yükselt`, `Efsun`, `Zanaat`, `Tezgâh`, `Taş Yuvası`, `Parçala`, `YÜKSELT`, `USTALIK YAP`, `ONAR`, `Talih`, `Talih Birikimi`, `Kader`, `Kader Eşiği`, `Taşa Aktar`, `Taştan Yükle`, `Satın Al`, `Değerli Taş`, `Düşük / Orta / Yüksek Yükseltme Kâğıdı`, `Kutsama Kağıdı`, `Demirci acıması hazır`, `Kırık`, `EŞYA KIRILDI!`, `Demirci onarabilir.`, `Basma Günlüğü`, `Tümünü Çevir`, `Tek Çevir`, `Efsun Ekle`, `Güçlendir`, `Kilitle`, `Yuvayı Aç`, `Temizle`, `Olası sonuçlar`, `Kalite`, `Zayıf / Vasat / İyi / Çok İyi / Mükemmel / Kusursuz`, `Yıldız Mührü / Ay Mührü / Güneş Mührü`, `Çelik Cila`, `Mavi Titreşim`, `Mor Rünler`, `Kızıl-Altın Alev`, `Prizma`, `Zırh Parlaması`, `Ustalık`, `Usta İşi`, `Kazıma`, `Tılsım`, `Ejderha Ruhu`, `Kamp`, `Kamp Takımı`, `Kamp Odunu`, `Kamp Konforu`, `Dinlenmiş`, `Ev`, `Köy Kulübesi`, `Karakol Evi`, `Kuzgunkale Konağı`, `Dekor`, `Kupa Panosu`, `Ev Taşı`.

---

## 7. IMPLEMENTATION PLAN (work packages for Haiku agents)

Conventions for **every** package (copy into the agent prompt): end with `npx tsc --noEmit` = 0 errors in your files; Turkish UI strings; **never throw from a frame loop**, degrade with `console.warn` once; touch **only** the files listed for your package; never change an existing exported signature (add optional fields / new exports); shared type files (`src/types/*`, `src/core/events.ts`) are touched only by **IT-00**; **new CSS goes in a new file** that the package's own TS imports (no package edits an existing CSS file); numbers come from this document and live in `src/data/*` constants, never inline; unknown ids (vfx, sfx, items) must fail silently; data files that other packages import must keep their exported names. "Owner" = module of `ARCHITECTURE.md`. `dev:` names the page that proves the package.

### 7.1 Wave schedule (≤ 3 agents in parallel, file-disjoint inside a wave)

| Wave | Packages | Priority | Why this grouping |
|---|---|---|---|
| 0 | **IT-00** contracts + stubs | P0 | everything imports its types and stubs |
| 1 | **IT-01** item data · **IT-10** armor shader + glow + vfx/sfx ids · **IT-12** net (remote gear slots, announcements) | P0 | data / vfx / net: disjoint files |
| 2 | **IT-02** upgrade v2 · **IT-03** efsun engine + quality + ItemGen · **IT-11** player armor-look hook | P0/P1 | `Upgrade.ts`+`Stacks.ts` / `Crafting.ts`+`Quality.ts`+`ItemGen.ts` / `CharacterModel.ts`+`Player.ts`+`armorLook.ts` |
| 3 | **IT-04** items glue (Masterwork, wrappers, CharacterState) · **IT-05** vendor + loot · **IT-30** blacksmith split | P0/P1 | systems / vendor+loot / panels refactor |
| 4 | **IT-31** Yükselt tab + ceremony · **IT-32** Efsun + Zanaat tabs · **IT-33** tooltips, badges, character panel | P0/P1 | three panels-items agents on disjoint files (shell from IT-30) |
| 5 | **IT-13** HUD announce banner · **IT-14** town NPC reactions · **IT-16** settings rows | P1 | hud / scenes / panels-game |
| QA-A | Haiku smoke test + Sonnet fixes (ROADMAP loop) | | gate for P0 + P1 |
| 6 | **IT-15** Mühür visuals on loot · **IT-40** Tılsım data + system · **IT-41** Kazıma | P1/P2 | `LootDrop.ts` / `Tilsim.ts`+`data/tilsim.ts` / `Engravings.ts`+`ItemGen.ts`+`StatCalc.ts` |
| 7 | **IT-42** armor tint + pendant · **IT-43** Tılsım procs (combat) · **IT-44** Tılsım + Kazıma UI | P2 | vfx / combat / panels-items |
| QA-B | gate for P2 | | |
| 8 | **IT-45** Efsun Aktarma · **IT-50** camp data + state · **IT-51** camp runtime | P2/P3 | `Crafting.ts` / `CharacterState.ts`+`Progression.ts`+`recipes.ts` / `scenes/Camping.ts` |
| 9 | **IT-52** camp effects (combat) · **IT-53** camp HUD · **IT-46** Ejderha Taşları system | P3 | combat / hud / items |
| 10 | **IT-47** Ejderha tab · **IT-54** death panel buttons · **IT-55** housing data + system | P3 | panels-items / panels-game / items |
| 11 | **IT-56** home interiors + town NPC (content) · **IT-58** `home` panel · **IT-59** Ev Taşı | P3 | content / panels-game / items |
| 12 | **IT-57** HomeRuntime + net `home` (scenes) | P3 | needs IT-56 DungeonDefs and IT-55 snapshots |
| QA-C | gate for P3 | | |

### 7.2 Packages

#### Wave 0

**IT-00 — Contracts, ids and stubs** · owner: **core (orchestrator)** · wave 0 · deps: GDD_V2 WP1 and GDD_LIFE L-00 are merged in the same orchestrator pass (one agent edits the shared files to avoid conflicts) · size M
- **Files:** `src/types/items.ts`, `src/types/character.ts`, `src/types/net.ts`, `src/types/vfx.ts`, `src/types/audio.ts`, `src/types/dungeons.ts`, **new** `src/types/itemsV2.ts`, `src/core/events.ts`, `src/core/Settings.ts`, `ARCHITECTURE.md`, **new data** `src/data/itemVisuals.ts` (complete), **stub data** `src/data/{upgradesV2,currencies,efsunSpecial,benchRecipes,engravings,tilsim,dragonStones,camp,homeProps}.ts`, **stub systems** `src/systems/{Stacks,Masterwork,Crafting,Quality,Tilsim}.ts`.
- **Tasks:**
  1. `types/items.ts`: `ItemInstance` += `bench?: RolledAffix | null; special?: RolledAffix | null; mw?: number; tilsim?: string | null; eng?: { id: string; pts: number }[]; broken?: boolean; upgradeBroken?: number; exalted?: boolean` (`exalted` only if GDD_V2 WP1 has not added it); `RolledAffix` += `s?: number` (S-tier 1..4); comment `failStacks` as deprecated (O-IT4).
  2. `types/itemsV2.ts` (new): every interface of Appendix A (`ArmorLook`, `UpgState`, `UpgLogEntry`, `QualityInfo`, `PlusStyle`, `ChatAnn`, `CampState`, `HomeSave`, `HomeSnapshot`, `CampMsg`, `HomeMsg`).
  3. `types/character.ts`: `CharacterSave` += `upg?: UpgState; home?: HomeSave; camp?: CampState`.
  4. `types/net.ts`: `chat` payload += `ann?: ChatAnn`; `NetChannels` += `camp: CampMsg; home: HomeMsg`.
  5. `types/vfx.ts` += `'set_aura','forge_announce','forge_announce_rainbow','camp_light','camp_smoke'`; `types/audio.ts` += `'forge_strike','forge_heartbeat','forge_ding','forge_crack','forge_shatter','camp_crackle','ann_chime'`.
  6. `types/dungeons.ts`: `TownNpcRole` += `'home'`; `DungeonDef` += `home?: boolean`; `DungeonParams` += `homeOwner?: number; returnTo?: { scene: string; x: number; z: number; yaw?: number }`.
  7. `core/events.ts` += `'upgrade:attempt': { uid: string; target: number; res: 0 | 1 | 2 | 3 | 4 | 5; chance: number }`, `'upgrade:announce': { from: string; ann: ChatAnn }`, `'efsun:changed': { uid: string; slot?: number }`, `'camp:placed': { x: number; z: number }`, `'camp:expired': Record<string, never>`, `'home:entered': { owner: number }`, `'home:left': Record<string, never>`; `core/Settings.ts` += `armorGlow: 'off' | 'low' | 'high'` (default `'high'`), `fastForge: boolean` (default `false`).
  8. `data/itemVisuals.ts` **complete** (shared by vfx, player, panels): `UPGRADE_TIERS` (6 rows of §1.1: `{ id, min, name, color, glowName }`), `tierOfLevel(n)`, `ARMOR_SLOT_ORDER = ['helm','shoulders','chest','gloves','legs','boots']`, `ARMOR_WEIGHTS = [1,1,2,1,1,1]`, `bodyLevel(lv: readonly number[]): number` (formula of §1.1), `ARMOR_LOOK` (amp per tier `[0.9,0.9,1.2,1.6,2.0,2.4]`, fresnel power 2.6, rune cell 14, flame scroll 3.5, sweep period 3.2 s, LOD near 30 far 55), `ARMOR_PARTICLES` (the table of §1.4 as data), `SET_AURA_COLORS` (§1.5), `plusStyle(up, mw)` (§4.3), `QUALITY_BANDS` (§4.2), `SEAL_THRESHOLDS = [75,90,97]`, `SEAL_STYLE`.
  9. Stub data files export the typed registries / constants named in §2.12, §3.11, §4.4–4.6, §5.3 with neutral content (`{}` / `[]` / the numeric constants where the doc gives them), the **id lists that `materials.ts` needs** (`TILSIM_TYPES = ['firtina','kor','buz','kan','golge','pinar','demir','ruzgar']`, `TILSIM_GRADES = 3`, `DRAGON_COLORS = ['kizil','mavi','yesil','sari','mor','siyah']`, `DRAGON_GRADES = 4`) and `export const TILSIM_ENABLED = false, ENGRAVING_ENABLED = false, DRAGON_ENABLED = false, CAMP_ENABLED = false, HOME_ENABLED = false` in their own files; later packages flip them.
  10. Stub systems export the final signatures returning `{ ok: false, reason: 'Henüz yok.' }` (or `null`): `Stacks`: `stackState, makeStone, loadStone, buyStone, sellStone`; `Masterwork`: `masterworkCost, masterwork`; `Crafting`: `previewCurrency, applyCurrency, rollSpecial, benchLine, canUseCurrency`; `Quality`: `itemQuality`; `Tilsim`: `tilsimSpecial` (returns `null`).
  11. `ARCHITECTURE.md`: add the new files to their module rows, panel id `home`, channels `camp` / `home` (owner **scenes**), the Items V2 flows (one paragraph each: armor glow, upgrade v2, efsun layers).
- **Done when:** `tsc` clean, game boots unchanged (no behaviour change), an old save loads, `dev/items.html` still opens.

#### Wave 1

**IT-01 — Item data tables** · owner: **items** · wave 1 · deps: IT-00 · size M
- **Files:** `src/data/upgradesV2.ts`, `src/data/currencies.ts`, `src/data/efsunSpecial.ts`, `src/data/benchRecipes.ts`, `src/data/materials.ts`, `src/data/upgrades.ts`, `src/dev/items.ts`.
- **Tasks:**
  1. `upgradesV2.ts`: verbatim constants of §2.12 with the 9 rows of §2.3 in `STACK_RULES` (`{ base, gain, pp, cap, keep }`: +7 `60,1,0.5,25,0.75` · +8 `50,1,0.5,25,0.75` · +9 `40,1,0.5,25,0.75` · +10 `30,2,0.6,30,0.4` · +11 `25,2,0.6,30,0.4` · +12 `20,2,0.6,30,0.4` · +13 `15,3,0.5,30,0` · +14 `10,3,0.5,30,0` · +15 `5,3,0.5,30,0`), `SCROLLS` (§2.5), `STONE_*` helpers, `MASTERWORK`; pure helpers `stackBonusPp(target, stacks)`, `chanceOf(target, stacks, scrollId?, baseChance)` (returns 0…1, applies `CHANCE_CAP`, returns 1 at `stacks >= STACK_MAX` for target ≥ 7), `stackGain(target)`, `stackAfterSuccess(target, stacks)`, `failOutcomeOf(target, o: { bound: boolean; scroll?: ScrollId; protect: boolean; acima: boolean }): FailOutcome | 'protected'` implementing the table of §2.6 and the softening rules of §2.5.
  2. `currencies.ts`: the 20 `CURRENCIES` entries (§3.1 table: ids, `verb`, `layer`, `tab`, Turkish `name` / `desc`, `icon` from existing SVGs: efsun items `item-efsun-orb`, `item-key`, `item-enchant-scroll`; orbs `item-efsun-orb` tinted; cores `item-crystal`; Kader Zarı `item-trinket`).
  3. `efsunSpecial.ts`: the 24 rows of §3.6 as `SPECIAL_AFFIXES` (`tiers: [S4, S3, S2, S1]` as `[min, max]` already divided by 100 for `pct`, `parryWindow` in seconds), `S_TIER_GATES = [1,30,50,72]`, `S_TIER_WEIGHTS = [100,60,30,10]`, `SPECIAL_BY_SLOT: Record<'weapon'|'chest'|'amulet', string[]>` (16 / 10 / 15 ids), helper `specialUsable(def)` that returns false when `def.stat` is not in `STAT_INFO`.
  4. `benchRecipes.ts`: `BENCH_COST_CLASS` (50 ids, §3.5 lists verbatim), `BENCH_COST` (`A: { gold: 3000, goldPerIlvl: 250, toz: 6, pulu: 2, ruh: 0, chaos: 2 }`, `B: { 5000, 350, 12, 4, 0, 4 }`, `C: { 8000, 500, 20, 8, 1, 8 }`), `benchValue(def: AffixDef, ilvl: number): number` (`round(0.75 × mid(best non-T0 tier eligible at ilvl) × intra-tier scale)`, honours `local` / percent scale of `data/affixes.ts`), `BENCH_SLOTS = ['weapon','offhand','helm','shoulders','chest','gloves','legs','boots']`, `SPECIAL_SLOTS = ['weapon','chest','amulet']`.
  5. `materials.ts`: **all** new ids of §0.4 (P0 to P3, so later packages never touch this file): `yukseltme_dusuk` (uncommon, sell 150, buy 1,500), `yukseltme_yuksek` (epic, sell 1,500), `degerli_tas_10/20/30/40/50` (rare, rare, epic, epic, legendary; sell = `stoneSellPrice`, icon `item-upgrade-stone`), `efsun_cekirdegi_6` (epic, sell 2,000), `efsun_cekirdegi_7` (legendary, sell 6,000), `kader_zari` (epic, sell 1,200), `efsun_aktarma` (epic), `kamp_takimi` (uncommon, sell 450, buy 1,800), `kamp_odunu` (common, sell 4, buy 15), `ev_tasi` (rare, sell 0, stack 1), `tilsim_<type>_<grade>` (8 types × 3 grades, generated from `TILSIM_TYPES` / `TILSIM_GRADES`, rarity by grade, Turkish names "Fırtına Taşı (Çırak)" …), `ds_<color>_<grade>` (6 × 4, generated from `DRAGON_COLORS` / `DRAGON_GRADES`, names "Kızıl Ejderha Taşı (Çiğ)" …), `ancient_dust` and the 7 `orb_*` **only if missing** (V2 WP3 definitions and sell prices); **rename** `demirci_el_kitabi` to "Orta Yükseltme Kâğıdı" (desc "Tek bir yükseltme denemesinin başarı şansını %10 artırır. +7…+9'da başarısızlıkta seviye düşmez."), keep id, price and stack.
  6. `upgrades.ts`: `glowTier()` gains `glow_steel` ("Çelik Cila", `#b8d0ff`) for `up >= 4` (existing returns unchanged for ≥ 7); export `UPGRADE_TIER_OF = tierOfLevel` re-export.
  7. `dev/items.ts`: panel "Basma simülasyonu": inputs target (7–15), start stacks, scroll, runs (default 20,000) → prints expected attempts, Kader share, and a green / red check against §2.3 (±3 %); panel "BP audit" placeholder (filled by IT-41).
- **Done when:** tsc clean; the simulation page reproduces the §2.3 table within ±3 %; `getMaterial` returns every new id.

**IT-10 — Armor shader, armor glow, set aura, vfx/sfx ids** · owner: **vfx-audio** · wave 1 · deps: IT-00 · size L
- **Files:** **new** `src/vfx/ArmorShader.ts`, **new** `src/vfx/ArmorGlow.ts`, `src/vfx/WeaponGlow.ts`, `src/vfx/VFX.ts`, `src/vfx/presets_world.ts`, `src/audio/manifest.ts`, `src/audio/Audio.ts`, `src/dev/vfx.ts` (and `dev/vfx.html` only if its buttons are static).
- **Tasks:**
  1. `ArmorShader.ts` exactly as §1.2–1.3: `buildArmorMask(base)`, `ensureSlotAttribute(mesh)` (bone-prefix map of §1.2; cache with `geometry.userData.armorSlot`), `attachArmorShader(root, mask)` (regex on node names; chains `onBeforeCompile` **after** the PSX patch; per-material uniforms kept in a module-level `ARMOR_UNIFORMS` WeakMap, never in `material.userData`; cache key `|armor<version>`), `ArmorShaderHandle` (`setLevels, setTime, setLod, setDebug, setSetPulse, dispose`), `ARMOR_SHADER_VERSION = 1`; GLSL strings from §1.3.3 with constants read from `ARMOR_LOOK` of `data/itemVisuals.ts`.
  2. `ArmorGlow.ts`: `class ArmorGlows { constructor(fx: Fx); set(root, look: ArmorLook | null, ctx: ArmorGlowCtx): void; remove(root); clear(); update(dt) }` with `ArmorGlowCtx = { classId: ClassId; baseMap: () => THREE.Texture | null; bone: (name: string) => THREE.Object3D | null; isLocal: boolean }`. `set` is idempotent (compares the look by value), (re)builds the mask + handle on first use and when a patched material is missing from `ARMOR_UNIFORMS`; `update` advances `uArmTime`, computes `uArmLod` from `fx.camPos` distance (§1.4), emits particles per the table of §1.4 (anchors, rates, 4-character cap, `armorGlow` setting: `off` forces levels to 0, `low` skips particles), emits the set-aura ground ring (`set_aura` vfx, parented to the root) and the 6 s silhouette pulse (`setSetPulse`), drops states whose root left the scene.
  3. `WeaponGlow.ts`: add the `steel` tier row of §1.1 to `TIERS` (level 4, `kind: 'none'`, `rate: 0`); nothing else changes.
  4. `VFX.ts`: `armorGlow(root, look, ctx?)`, `clearArmorGlow(root)`; construct `ArmorGlows` next to `WeaponGlows`; call `armorGlows.update(dt)` in the update loop; `clear()` on scene change.
  5. `presets_world.ts`: implement `set_aura` (additive ring decal radius 1.1 m, rotates 20°/s, colour via `opts.color`, `opts.follow`), `forge_announce` (gold light pillar 3 m, 1.5 s), `forge_announce_rainbow` (hue-cycling pillar + 40 sparkles, 3 s), `camp_light` (LightPool flicker `0xff7a2a` r 11), `camp_smoke` (slow grey puffs). `audio/manifest.ts` + `Audio.ts`: map `forge_strike` → `hit_metal` (pitch 0.9 + random 0.05), `forge_heartbeat` → `hit_blunt` pitch 0.5, `forge_ding` → `upgrade_success` (pitch from `opts.pitch`), `forge_crack` → `upgrade_fail`, `forge_shatter` → `upgrade_destroy`, `camp_crackle` → `torch` loop sample (existing ambience, pick the nearest existing file), `ann_chime` → `level_up` at −6 dB; unknown files fail silently.
  6. `dev/vfx.ts`: row "Zırh": class picker (Knight / Barbarian / Mage / Rogue_Hooded via `loadCharacterModel`), buttons for all-slots `+0 / +4 / +7 / +9 / +12 / +15`, a slot picker (set one slot to +15), "Slot debug", "Set aura 2 / 4 / tam", "Kaskı gizle", setting toggle `armorGlow`, a button that clones / disposes the model 20 times (leak check).
- **Done when:** acceptance list of §1.8 passes in `dev/vfx.html` for all four GLBs; tsc clean; no console errors; frame time of 5 prism characters < +0.3 ms vs. no glow on the reference machine.

**IT-12 — Net: remote armor slots + announcements** · owner: **net** · wave 1 · deps: IT-00 (and GDD_LIFE L-32 if already merged: merge into its `sendChat`, otherwise add on the current `chat` handler) · size S
- **Files:** `src/net/Replication.ts`, `src/net/NetSession.ts`, `src/net/messages.ts`, `src/dev/net.ts`.
- **Tasks:** (1) `Replication.VISIBLE_SLOTS` → `['weapon','offhand','helm','shoulders','chest','gloves','legs','boots']` (both loops, lines ≈ 402 and 640); `compactItem` copies `broken`; `cleanItem` accepts `broken: boolean` and `upgrade` 0–15. (2) `sanitizeAnn(raw): ChatAnn | null` (`k` ∈ `'upg' | 'mw'`; `n` through `sanitizeText`, ≤ 48 chars; `l` integer clamped 4…15; `r` a valid `Rarity` else `'common'`; `c` a valid `ClassId` else absent). (3) `NetSession.sendAnnouncement(ann: ChatAnn, text: string)`: broadcasts `chat { text, ann }`; refuses when the last announcement of this sender was < 10 s ago; for `l === 15` and an open lobby transport also sends `lchat { …, ann }`. (4) receive: validate with `sanitizeAnn`, rate-limit 1 / 10 s per sender, emit `G.events.emit('upgrade:announce', { from: senderName, ann })` in addition to the normal `net:chat` event. (5) dev: two-tab test button "Duyuru gönder (+12 / +15)".
- **Done when:** with two tabs the second tab receives the line, the event and (+15) the lobby copy; spoofed `l = 99` is clamped; a second announcement within 10 s is dropped; remote avatars show armor glow after `gear` (checked together with IT-11).

#### Wave 2

**IT-02 — Upgrade v2: Talih, scrolls, break rules, pity, repair** · owner: **items** · wave 2 · deps: IT-00, IT-01 · size L
- **Files:** `src/systems/Upgrade.ts`, `src/systems/Stacks.ts`, `src/systems/CharacterState.ts` (only: `get upg(): UpgState` creating `{ stacks: 0, fails: 0, wins: 0, destroyStreak: 0, best: 0, log: [] }` on first access, `pushUpgLog(e)`, `setStacks(n)` clamping 0…60, emitting `inventory:changed` and persisting).
- **Tasks:**
  1. `upgradeCost(item, opts)` v2 returns `UpgradeCostV2 { …UpgradeCost, stacks, stackBonus, scrollBonus, scrollId?, pity: boolean, acimaReady: boolean, failOutcome: FailOutcome (after softening), bound: boolean }` using `chanceOf` and `failOutcomeOf` of IT-01; `opts.useBook` is an alias of `scroll: 'demirci_el_kitabi'`; `protectedBy` stays `'kutsama_kagidi'` for any outcome other than `stay`. Refuse with a Turkish reason when the item is `broken` ("Kırık eşya önce onarılmalı").
  2. `rollUpgradeOutcome(target, o, r)` v2 (pure): success roll against `chanceOf`; Kader (`stacks >= 60`, target ≥ 7) = success `outcome: 'pity'`; failure → `failOutcomeOf`.
  3. `upgradeItem(uid, opts)` v2: pays gold + materials + the chosen scroll + Kutsama; rolls; applies: success → `upgrade = target`, `stacks = stackAfterSuccess`, `destroyStreak = 0`, +1 socket at +15 (existing), `refreshItemName`, announcements (`target >= 12`: `G.net?.sendAnnouncement({ k: 'upg', n: cleanName, l: target, r: rarity, c: classId }, text)` + local `net:chat` system line, existing behaviour kept); failure → `stacks = min(60, stacks + stackGain(target))` (only target ≥ 7), outcome `stay` / `down1` (−1) / `down3` (`max(0, level − 3)`) / `destroy` (`ch.removeItem`) / `break` (`item.broken = true; item.upgradeBroken = level; item.upgrade = max(0, level − 3)`; `upgradeBroken` is the level before the failure, used by the repair formula, fallback `upgrade + 3`), `destroyStreak` ± per §2.6, Acıma application, `pity` success consumes all stacks; pushes a log entry; emits `upgrade:attempt` and the existing `item:upgraded` (payload gains optional `outcome`, `stacksBefore`, `stacksAfter`). Result `UpgradeResult` gains `outcome`, `stacksBefore`, `stacksAfter`, `scrollUsed`, `acima`, `pity`.
  4. `repairItem(uid)`: cost of §2.6 (`gold = round(300 × ilvl × (1 + 0.15 × levelBefore))`, `ruh_tasi × (2 + floor(levelBefore / 4))`, `ancient_dust × 5`); clears `broken`, keeps `upgrade`.
  5. `Stacks.ts` (replaces the IT-00 stub): `stackState(): { stacks: number; max: 60; nextGuarantee: number; stones: { size: number; owned: number }[]; buyLeft: Record<number, number> }`; `makeStone(size)` (fee `stoneFee`, consumes `size` stacks); `loadStone(size)` (consumes one stone, `stacks = min(60, stacks + size)`); `buyStone(size)` (`stoneBuyPrice`, 1 per size per day, day = `floor((Date.now() − 4 h) / 86 400 000)` stored in `flags['upg.buy.<size>']`); `sellStone(size)` (`stoneSellPrice`).
  6. Keep `upgradeChance(target, failStacks, useBook)` exported (dev pages) mapped to the new formula with `stacks = failStacks`.
  7. Salvage (`salvageYield`): broken items return the upgrade-material share halved; stones are not salvageable.
- **Done when (`dev/items.html` headless):** (a) the full outcome table of §2.6 is asserted for every target, bound / unbound, each scroll, with and without Kutsama and Acıma; (b) Monte-Carlo expected attempts within ±3 % of §2.3; (c) stone fee / buy / sell numbers and the daily limit; (d) repair numbers; (e) `destroy` never happens for bound items; (f) an old-save item with `failStacks` upgrades without error; tsc clean.

**IT-03 — Efsun engine, quality, ItemGen v2** · owner: **items** · wave 2 · deps: IT-00, IT-01 · size L
- **Files:** `src/systems/Crafting.ts`, `src/systems/Quality.ts`, `src/systems/ItemGen.ts`.
- **Tasks:**
  1. `ItemGen.ts` numbers: `mwEffective(item) = (item.upgrade ?? 0) >= 15 ? Math.min(5, item.mw ?? 0) : 0`; `lineMult(item, a) = (isFixed(a) ? 1 : efsunBoost(item)) + 0.03 × mwEff` replaces the `a.locked ? 1 : boost` expressions in `weaponNumbers`, `armorNumber`, `itemStats` (identical results when `mw = 0`); `itemStats` adds `bench` and `special` lines (value × `lineMult`), returns `{}` when `item.broken`; `describeItem` fills the new optional fields of §6.4 (`plus`, `badges`, `quality`, `pips`, `benchLine`, `specialLine`, `masterwork`, `glowName`, `broken`) using `plusStyle`, `itemQuality`, `UPGRADE_TIERS`; item name gets `(Usta İşi)` at `mw === 5` in `refreshItemName`; `sellValue` factor `1 + 0.15·[bench] + 0.25·[special]`.
  2. `rollSpecial(item, rng, classId?, role?)` (Crafting.ts): legal lines for the item's equipment slot via `SPECIAL_BY_SLOT`, ×2 weight when `tags` match the role, S-tier by `S_TIER_GATES` / `S_TIER_WEIGHTS` at the item's ilvl, value uniform in the tier range × intra-tier scale, returns `RolledAffix { affixId: 'sp_…', stat, value, tier: s, s }`. `benchLine(item, affixId)`: `RolledAffix { affixId, stat, value: benchValue(def, ilvl), tier: bestTier }`, refuses ids already on slots 1–5 and ids not legal for the item category.
  3. `Quality.ts`: `itemQuality(item): QualityInfo | null` exactly as §4.2 (`bestMax`, `lineQ`, bench excluded, special included, uniques / sets by fixed ranges); `qualityBand(q)`, `sealOf(q)`.
  4. `Crafting.ts` — `previewCurrency(uid, id, o)` and `applyCurrency(uid, id, o)` for every verb of §3.1 (`rerollAll` = existing `rerollAffixes` keeping locks, `rerollOne` picks a random unlocked line and rerolls only it (type + value), `addOne` = existing `addRandomAffix`, `addHigh` = Yüceltme (tier ≤ T3 weights 40/35/20/5, once per item: sets `item.exalted`), `removeOne`, `values` = existing `rerollAffixValues` extended to `special`, `rarity` (`orb_chance` weights 62/30/7/1) and `alchemy` (Normal → Nadir with 4 affixes) per V2 §4.3, `corrupt` (outcomes 30 % nothing / 25 % values −10…+20 % / 20 % +1 socket / 15 % extra implicit / 10 % **+1 Ustalık rank**, sets `corrupted`), `unlock6` (`bench = null`), `bench` (needs `o.recipe`), `unlock7` (rolls `special`, costs 20,000 gold), `rerollSpecial`). `canUseCurrency(item, id): { ok: boolean; reason?: string }` implements the rarity / slot / corrupted / broken gating of §3.1–3.2 with Turkish reasons. Every success emits `efsun:changed` and calls the existing `finishEquipChange` equivalent (recompute stats, persist, `inventory:changed`).
  5. Orb costs: Kaos / Arınma / Yüceltme / Şans / Simya / Bozulma consume exactly 1 of their material (V2); Efsun items: gold per §3.7.
- **Done when (`dev/items.html`):** every row of the §3.1 gating table is accepted / refused as written; lock behaviour; slot 6 and 7 eligibility by equipment slot (weapon 16 / chest 10 / amulet 15 special lines); bench values for 5 sample ids at ilvl 30 / 60 / 80; quality for fixtures (random Nadir ≈ 29, Destansı ≈ 53 average over 2,000 rolls); `mw` multiplier equals §2.8; `itemStats` unchanged for items without the new fields (regression against a snapshot of 200 generated items); tsc clean.

**IT-11 — Player: armor look hook** · owner: **player** · wave 2 · deps: IT-00, IT-10 (vfx API) · size M
- **Files:** **new** `src/entities/armorLook.ts`, `src/entities/CharacterModel.ts`, `src/entities/Player.ts`, `src/dev/player.ts`.
- **Tasks:** (1) `computeArmorLook(gear, hideHelm = false): ArmorLook`: `lv[i]` = `item && !item.broken ? clamp(item.upgrade ?? 0, 0, 15) : 0` for `ARMOR_SLOT_ORDER` (helm 0 when `hideHelm`), `body = bodyLevel(lv)`, `set` = the `setId` with the highest count over **all** gear items when `count ≥ 2` (`total = SETS[id]?.pieces.length ?? (id.startsWith('tier_') ? 5 : 4)`, `color = SET_AURA_COLORS[id] ?? 0xffffff`), else `null`. (2) `CharacterModel`: `setGear(g)` calls `applyArmorLook(computeArmorLook(g ?? {}, hideHelm))` after the weapon work; `applyArmorLook` calls `G.vfx.armorGlow(body, look, { classId, isLocal, bone: (n) => bones[n] ?? findBone(body, n), baseMap })` where `baseMap` returns the original palette (`baseOf.get(map) ?? map` of the first body-mesh material); add `setArmorLook(look)` and `armorLook()` to the `CharacterModel` interface and to the fallback object; `dispose()` calls `G.vfx.clearArmorGlow(body)`; `applyVariant()` re-applies the look after the material change; `loadCharacterModel` passes the initial `gear` so the menu / preview / remote avatars glow on first frame. (3) `Player.VISIBLE_SLOTS` → the 8 slots of IT-12; `currentGear()` unchanged otherwise; the local player's equipment events already call `refreshEquipmentVisuals`. (4) `dev/player.ts`: buttons "Tüm zırh +N" and "Slot +15" that equip fixtures through `G.character` and show the result.
- **Done when:** in `dev/player.html` equipping a +12 chest and +9 gloves shows flame on the chest region and runes on the gauntlets only; remote avatar (second tab) shows the same after `gear`; menu 3D select and the character preview show the shader; tsc clean.

#### Wave 3

**IT-04 — Items glue: Masterwork, wrappers, CharacterState APIs** · owner: **items** · wave 3 · deps: IT-02, IT-03 · size M
- **Files:** `src/systems/Masterwork.ts`, `src/systems/Upgrade.ts` (wrappers only), `src/systems/CharacterState.ts`, `src/systems/ItemLevel.ts` (only if it exists from GDD_LIFE L-09; else skip).
- **Tasks:** (1) `Masterwork.ts` (replaces the stub): `masterworkCost(item): { gold, materials, rank } | null` (`MASTERWORK` table, null unless `upgrade === 15`, rarity epic / legendary / set, not broken, `mw < 5`), `masterwork(uid): { ok; reason?; newRank? }` (100 % success, consumes cost, `item.mw += 1`, name suffix, announcement `k: 'mw'` at rank 5, emits `item:upgraded` with `outcome: 'mw'`). (2) `Upgrade.ts`: `efsun`, `kadimEfsun`, `takviye` become wrappers around `Crafting.applyCurrency` (`rerollAll` with `lock`, `values`, `addOne`) with identical return shapes and Turkish reasons; `efsunCost` unchanged. (3) `CharacterState`: thin methods `applyCurrency(uid, id, o)`, `masterwork(uid)`, `stackState()` delegating to the systems (so panels can use `G.character`). (4) `MW_ILVL = [0,1,2,3,5,7]` used by `itemIlvlEquiv` when `ItemLevel.ts` exists (O-IT8).
- **Done when:** `dev/items.html`: old efsun / kadim / takviye flows give the same results as before on 50 fixtures (seeded RNG); Ustalık costs match §2.8; rank 5 shows the suffix; tsc clean.

**IT-05 — Vendor and loot (all phases, flag-guarded)** · owner: **items** · wave 3 · deps: IT-01 · size M
- **Files:** `src/systems/Vendor.ts`, `src/systems/LootSystem.ts`, `src/data/loot.ts`, `src/systems/Bounties.ts` (only the Günlük Sandık reward table).
- **Tasks:** (1) Demirci shop (`vendorEntries('blacksmith')`): `yukseltme_dusuk` 1,500; `demirci_el_kitabi` 12,000 (max 3 / day); stones (`degerli_tas_*`, price `stoneBuyPrice`, 1 per size per day) are handled by `Stacks.buyStone`, not the generic list; existing `efsun_nesnesi` (max 5 / day) untouched. (2) Mühürdar offers (`sealOffers`): add `yukseltme_dusuk` 8, `demirci_el_kitabi` 25 (exists), `yukseltme_yuksek` 120, `efsun_cekirdegi_6` 120 (1 / week), `efsun_cekirdegi_7` 400 (1 / week), `kader_zari` 60, `kutsama_kagidi` 50 (exists), `efsun_aktarma` 150 (guarded by `CURRENCIES` existing), Tılsım grade 1 for 10 and grade 2 for 60 (guarded by `TILSIM_ENABLED`), Ejderha grade-1 stone via Kalıntı Tüccarı 20 `metin_kalintisi` (guarded by `DRAGON_ENABLED`); weekly limits use `flags['seal.week.<id>'] = weekIndex` (week = Monday 04:00 reset, same helper as the vault). (3) Tradesman (`vendorEntries('tradesman')`): `kamp_takimi` 1,800 and `kamp_odunu` 15 (guarded by `CAMP_ENABLED`). (4) Sell prices: `sellPriceOf` applies the §3.8 factor for items with `bench` / `special`; stones sell at `stoneSellPrice`. (5) Loot: the drop table of §3.9 (rows per source rank / M+ boss / M+ chest / raid boss / Efsun Goblini / Günlük Sandık; raid rows guarded by the existence of the raid source ids) through the existing `DropTable` mechanism (`extra: [{ id, chance, count }]`), key scaling for the M+ rows; `Bounties` Günlük Sandık gets `yukseltme_dusuk` 15 % and `kader_zari` 3 %.
- **Done when:** headless `dev/items.html` drop-rate check (50,000 simulated kills per source row within ±15 % of the table), the Mühürdar list shows the new offers with weekly limits, no change to existing prices; tsc clean.

**IT-30 — Blacksmith panel split (pure refactor)** · owner: **panels-items** · wave 3 · deps: IT-00 · size M
- **Files:** `src/ui/panels/items/BlacksmithPanel.ts`, **new** `src/ui/panels/items/blacksmith/{index,shared,UpgradeTab,EfsunTab,CraftTab,SocketTab,SalvageTab,Ceremony}.ts`, `src/ui/panels/items/backend.ts`.
- **Tasks:** (1) move each `buildX` / `doX` / `revealX` method into its tab module behind the interface `ForgeTab { id: 'up' | 'efsun' | 'craft' | 'socket' | 'salvage'; label: string; icon: string; build(ctx: ForgeCtx, item: ItemInstance | null): void }` with `ForgeCtx { info: HTMLElement; item(): ItemInstance | null; refresh(): void; busy(): boolean; perform<T>(…): void; fx: ForgeFx; banner(…); stageFlash(…); matRow(…); goldRow(…); toggleRow(…); itemHeader(…) }`; `blacksmith/shared.ts` holds the helpers (`chanceColor`, `yieldText`, `gemEffectText`, constants `STAGE_W`, `STAGE_H`, `CX`, `CY`); the shell keeps stage, slot, tabs, shop strip, subscriptions. **No behaviour change.** (2) Register the five tabs (`craft` initially shows "Yakında" with the item header; IT-32 fills it); panel `width: 780, height: 640`. (3) `backend.ts`: extend `forgeApi` with `repairItem, stackState, makeStone, loadStone, buyStone, sellStone, masterwork, masterworkCost, previewCurrency, applyCurrency, canUseCurrency, itemQuality` bound to the IT-00 stubs (real after IT-02 / 03 / 04).
- **Done when:** `dev/panels-items.html`: every existing blacksmith flow (upgrade, efsun with locks, sockets, salvage) behaves identically (screenshot compare of the old and new panel at the same state); the file `BlacksmithPanel.ts` is < 250 lines; tsc clean.

#### Wave 4

**IT-31 — Yükselt tab and the ceremony** · owner: **panels-items** · wave 4 · deps: IT-02, IT-04, IT-30 · size L
- **Files:** `src/ui/panels/items/blacksmith/UpgradeTab.ts`, `src/ui/panels/items/blacksmith/Ceremony.ts`, `src/ui/panels/items/ForgeFx.ts`, **new** `src/ui/styles/forge-upgrade.css`.
- **Tasks:** build the Yükselt tab of §6.1 (header with `plusStyle`, stacked success bar, Talih bar with notches and the **Taş ▾** drawer using `forgeApi.makeStone / loadStone / buyStone / sellStone`, scroll tiles, Kutsama toggle, Acıma icon, failure line logic, preview, cost rows, `YÜKSELT`, +15 **Ustalık** mode, **Kırık** mode with `ONAR`, `Basma Günlüğü` drawer reading `G.character.upg.log`); `Ceremony.ts`: `runUpgradeCeremony(ctx, plan: { target, chance, pity, armed, destroyKind }, resolve: () => UpgradeResult)` implements the timeline table of §2.9 (strike count by target, Gerilim rule, result reveals, `fastForge` / click-skip with delays × 0.15, sound ids `forge_*`, `G.events.emit('item:upgraded')` is emitted by the system, not here); `ForgeFx.crack(x, y)` and `ringFill(x, y, t01, color)`; texts exactly as §2.6.
- **Done when:** in `dev/panels-items.html` with forced outcomes (mock `forgeApi.upgradeItem`) every banner, sub-line, shard / crack / ring effect and sound id fires; stacks and chance bar update after each attempt; drawer actions work with fixtures; `fastForge` skips; no console errors; tsc clean.

**IT-32 — Efsun and Zanaat tabs** · owner: **panels-items** · wave 4 · deps: IT-03, IT-30 · size L
- **Files:** `src/ui/panels/items/blacksmith/EfsunTab.ts`, `.../CraftTab.ts`, **new** `.../EfsunList.ts`, **new** `src/ui/styles/forge-efsun.css`.
- **Tasks:** `EfsunList` (up to 7 rows: tier ticks, per-line quality %, padlock toggle with Kilit cost, silver / gold diamond rows, flash on change); Efsun tab of §6.2 (cards for Tümünü Çevir / Efsun Ekle / Güçlendir / 6. Yuvayı Aç / 7. Yuvayı Aç / Kader Zarı / Temizle, live cost, **Olası sonuçlar** popover from `previewCurrency().tierOdds`); Zanaat tab of §6.3 (orb shelf with counts, line picker, Tezgâh sub-tab with role-sorted recipe list, fixed value preview, cost, `TEZGÂHTA YAP`, Bozulma confirm via `G.ui.confirm`); every action goes through `forgeApi.applyCurrency`; result animation = `res-magic` variant + changed-row flash; Turkish reasons from `canUseCurrency` on disabled cards.
- **Done when:** with fixtures in `dev/panels-items.html` every verb works end to end, locks are respected, slot 6 / 7 flows (unlock → fill → clear / reroll) work, corrupted / broken items show reasons, popovers show the odds of §3.3; tsc clean.

**IT-33 — Tooltips, `+N` badges, seal frames, character panel** · owner: **panels-items** · wave 4 · deps: IT-03, IT-11 · size M
- **Files:** `src/ui/panels/items/common.ts`, `src/ui/panels/items/CharacterPanel.ts`, **new** `src/ui/styles/forge-tooltip.css`.
- **Tasks:** `fallbackItemHTML` and the tooltip builder render the **line order of §6.4** from the new `ItemDescription` fields (pips, Kalite bar, Mühür badge, Tezgâh / Özel lines, Ustalık, glow name, KIRIK header, `+N` token via `plusStyle`); `ItemSlot.set` draws the `+N` pill (glow ≥ +12, animation +15), seal frame classes, crack overlay for broken items, optional quality dot; `CharacterPanel` adds **Zırh Parlaklığı** (uses `computeArmorLook` + `bodyLevel` + `UPGRADE_TIERS`), the **Efsun Özeti**, and placeholders for Kazıma / Tılsım (IT-44 fills them).
- **Done when:** fixture items (each rarity, +0 / +4 / +9 / +15, broken, with bench / special, seal bands) render correctly in the tooltip and the bag; the character panel shows the armor readout; tsc clean.

#### Wave 5

**IT-13 — HUD announcement banner** · owner: **hud** · wave 5 · deps: IT-12 · size S
- **Files:** **new** `src/ui/hud/Announce.ts`, `src/ui/hud/index.ts` (register only), **new** `src/ui/styles/hud-announce.css`, `src/dev/hud.ts`.
- **Tasks:** subscribe to `upgrade:announce`; top-centre strip: gold (`l` 12–14, 2.5 s) or rainbow "DUYURU" (`l` 15, 6 s; CSS hue animation), item name in `RARITY_COLORS[r]`, class colour for the player name, `G.audio.sfx('ann_chime')`; queue (max 3 pending, newest replaces after 1 s); respects UI Edit Mode frame id `announce`; dev button fires fake `+12` / `+15` / `mw`.
- **Done when:** the three variants render in `dev/hud.html`, queueing works, no overlap with the boss / M+ trackers; tsc clean.

**IT-14 — Town: forge reactions** · owner: **scenes** · wave 5 · deps: IT-10, IT-02 · size S
- **Files:** `src/scenes/SceneTown.ts`, `src/entities/NPC.ts` (only a `playOnce(clip: string)` method if missing), `src/dev/scenes.ts`.
- **Tasks:** on `item:upgraded` while the blacksmith panel is open: `npc_demirci` plays `Cheer` (success ≥ +7), `Hit_B` (failure / destroy / break), `Hit_A` head-shake on destroy; `+12`+ spawns `forge_announce` at the anvil prop position, `+15` `forge_announce_rainbow`; on `upgrade:announce` from another peer spawns the same vfx over that avatar when in the same scene; Efsuncu Nergis plays `Spellcast_Shoot` on `efsun:changed`.
- **Done when:** in `dev/scenes.html` forced events animate both NPCs and spawn the vfx; no errors if an NPC is missing; tsc clean.

**IT-16 — Settings rows** · owner: **panels-game** · wave 5 · deps: IT-00 · size S
- **Files:** `src/ui/panels/game/settings.ts`.
- **Tasks:** Grafik: **Zırh Parlaması** dropdown (Kapalı / Düşük / Yüksek → `armorGlow`), Oyun: **Hızlı Basma** toggle (`fastForge`); both persisted through `Settings`.
- **Done when:** the rows appear, persist across reload, and `dev/vfx.html` reacts to the setting live; tsc clean.

#### Wave 6 (P1 leftover + P2)

**IT-15 — Mühür and quality on loot** · owner: **items** · wave 6 · deps: IT-03 · size S
- **Files:** `src/entities/LootDrop.ts`.
- **Tasks:** at drop creation compute `itemQuality(item)`; label suffix `(Yıldız Mührü)` etc. in the seal colour; Yıldız = 3 orbiting sparkles, Ay = slow violet ring on the beam base, Güneş = gold ring + 2× core + toast "Güneş Mührü!" on pickup; `ann_chime` on pickup for Ay / Güneş; loot filter hook `filter_always_show_seal` (reads the setting if it exists).
- **Done when:** a dev drop of fixtures in each band shows the three treatments; no cost when no seal; tsc clean.

**IT-40 — Tılsım data and system** · owner: **items** · wave 6 · deps: IT-03 · size M
- **Files:** `src/data/tilsim.ts` (fill, flip `TILSIM_ENABLED = true`), `src/systems/Tilsim.ts` (replaces the IT-00 stub; Tılsım verbs live here, `Crafting.ts` is not touched).
- **Tasks:** `TILSIM` table of §4.4 (8 types × 3 grades with `{ chance, coef, icd, slot }`), `openTilsimSlot(uid)` (20,000 gold + 1 Ruh Taşı, weapon / chest, Nadir+, not broken), `socketTilsim(uid, stoneId)`, `removeTilsim(uid)`, `combineTilsim(type, grade)` (1,000 / 10,000 gold, 3 → 1), `tilsimSpecial(item): { id, params } | null` (the stub of IT-00 already exports it; `StatCalc.ts` belongs to IT-41, which calls it, so the two agents never edit the same file).
- **Done when:** headless: open / socket / remove / combine rules, class-slot restrictions (`ts_demir`, `ts_ruzgar` chest only), `tilsimSpecial` returns the right params; tsc clean.

**IT-41 — Kazıma (engravings) + StatCalc folding** · owner: **items** · wave 6 · deps: IT-03 · size M
- **Files:** `src/data/engravings.ts` (flip `ENGRAVING_ENABLED = true`), `src/systems/Engravings.ts` (new), `src/systems/ItemGen.ts`, `src/systems/StatCalc.ts`, `src/systems/Crafting.ts`.
- **Tasks:** `ENGRAVINGS` (12 rows of §4.5); `rollEngravingRows(item, rng, role)` (rows by rarity, points 3…7 with weights 30/30/20/12/8) called from `buildFromBase` for amulet / ring; `engravingTotals(equipment)` (sum per id, level by 5 / 10 / 15), `activeEngravings(equipment)` (top 3); `StatCalc.computeStats` adds the stats of active levels and calls `Tilsim.tilsimSpecial(item)` to `registerSpecial` for equipped weapon / chest; `Crafting.ts` reroll semantics (`rerollAll` rerolls rows unless a Kilit exists, `values` rerolls points only); describeItem `engravingLines`; dev BP audit: archetype totals per layer vs the caps of §4.7.
- **Done when:** headless: total points → levels; top-3 rule; stats folded exactly; rows survive a Kilit reroll; BP audit prints typical ≤ 1,300 BP for the three archetypes; tsc clean.

#### Wave 7 (P2)

**IT-42 — Armor tint, pendant, preview hover** · owner: **vfx-audio** · wave 7 · deps: IT-10, IT-11 · size S
- **Files:** `src/vfx/ArmorShader.ts`, `src/vfx/ArmorGlow.ts`, `src/dev/vfx.ts`.
- **Tasks:** `uArmTint[6]` + `setTint` (§1.9, multiplies metal / trim only, T1 none, T2 `#8fa9c8`, T3 `#d9b45a`, T4 `#9c2f2f`, T5 `#3fe0c8` + 0.15 emissive); `ArmorLook.tint` honoured; amulet pendant sprite on bone `chest` (≥ +7); dev toggles.
- **Done when:** the four GLBs show the five base tints distinctly and stay readable under glow; tsc clean.

**IT-43 — Tılsım procs** · owner: **combat** · wave 7 · deps: IT-40, IT-41 · size M
- **Files:** `src/combat/specials.ts`, `src/combat/Combat.ts`.
- **Tasks:** implement the 8 `ts_*` specials by id from `hasSpecial / specialParams` (on-hit chance with ICD, on-crit, on-kill heal, on-skill-cast resource, on-hit-taken armor buff, on-dodge move speed); proc damage uses `rollOutgoing` with `coef × weapon average`, tagged `proc` (no further procs); dev combat page buttons per stone with a DPS log; cap check "Tılsım DPS ≤ 10 % of weapon DPS".
- **Done when:** `dev/combat.html` shows each proc with its ICD, damage numbers and vfx (reuse presets), the DPS cap holds; tsc clean.

**IT-44 — Tılsım and Kazıma UI** · owner: **panels-items** · wave 7 · deps: IT-40, IT-41, IT-33 · size M
- **Files:** `src/ui/panels/items/blacksmith/SocketTab.ts`, `src/ui/panels/items/CharacterPanel.ts`, `src/ui/panels/items/InventoryPanel.ts` (right-click "Tılsım tak"), **new** `src/ui/styles/forge-tilsim.css`.
- **Tasks:** Socket tab section "Tılsım Yuvası" (open, socket, remove, combine 3 → 1); Character panel **Kazımalar** list (`Keskin Pençe  8 / 10`, active ones highlighted, greyed overflow) and **Tılsım** summary; tooltips already render `engravingLines` / `tilsimLine` from IT-33.
- **Done when:** fixtures show all flows; tsc clean.

#### Wave 8 (P2 / P3)

**IT-45 — Efsun Aktarma** · owner: **items** · wave 8 · deps: IT-03 · size S
- **Files:** `src/systems/Crafting.ts`, `src/dev/items.ts`.
- **Tasks:** `transferLine(srcUid, line, dstUid)` per §3.10 (same category group, free slot below cap, no duplicate affix id, refuse corrupted / bench / special, destroys the source); `applyCurrency('efsun_aktarma', …)` wiring; headless checks.
- **Done when:** checks pass; tsc clean.

**IT-50 — Camp data, state, recipes** · owner: **items** · wave 8 · deps: IT-01 · size M
- **Files:** `src/data/camp.ts` (flip `CAMP_ENABLED = true`), `src/data/recipes.ts` (GDD_LIFE L-04; add `rcp_kamp_takimi`, `rcp_kamp_odunu`; if that file does not exist yet, export them as `CAMP_RECIPES` from `data/camp.ts` and let L-04 import them), `src/systems/CharacterState.ts` (`camp` state getters: `restedFraction`, `addRested(f)`, `consumeRested(xp): number`), `src/systems/Progression.ts` (`addXp`: extra XP from the rested pool, §5.1.4, not in M+).
- **Tasks:** `KAMP` constants of §5.3; the two recipes; `CharacterSave.camp` defaults; `Progression.addXp(xp)` returns / awards `bonus = min(pool, xp × KAMP.restedXpBonus)` and drains the pool; `flags['buff.rest']` remaining-time helper like food.
- **Done when:** headless: pool accrual / drain numbers, no bonus in M+, recipes craft the kit; tsc clean.

**IT-51 — Camp runtime** · owner: **scenes** · wave 8 · deps: IT-10, IT-50 · size L
- **Files:** **new** `src/scenes/Camping.ts`, **new** `src/entities/interactables/CampSite.ts`, `src/entities/interactables/index.ts`, `src/scenes/DungeonScene.ts` (outdoor branch only: construct / update / dispose `Camping`), `src/dev/scenes.ts`.
- **Tasks:** `Camping`: `canPlace(pos): { ok: boolean; reason?: string }` (rules of §5.1.2: outdoor only, distances from waypoints / villages / entrances / metin / boss arenas read from the world data, combat check via `G.combat`, `NavGrid` walkable), `place()` (5 s channel with `Interact`, consumes a kit, spawns `CampSite`, `camp_light`, `camp_smoke`, `camp_crackle`), `pack()`, `refuel()`, `update(dt)` (fuel, 60 s warning, expiry, `camp:placed/expired`), `isResting(pos)` (any known camp within 8 m, own or party), `respawnPoint()` (lit own / party camp); `CampSite` interactable group (tent `F` "Kampı topla", fire `F` "Odun at", pot = `PanelProp` `crafting { station:'cookfire' }` range 5); net channel `camp` send / receive (§5.1.6) with the 1 / s rate limit and validation; one camp per character.
- **Done when:** in `dev/scenes.html` (outdoor zone) placing, refuelling, expiring, packing, party visibility (two tabs) and the placement refusals all work; tsc clean.

#### Wave 9 (P3)

**IT-52 — Camp effects** · owner: **combat** · wave 9 · deps: IT-51 · size S
- **Files:** `src/combat/Combat.ts`, `src/data/statuses.ts`.
- **Tasks:** in `updateLocalPlayer`: if `Camping.isResting(pos)` and out of combat for 6 s → HP regen ×3, resource ×2 (replaces, does not stack with, the emote Dinlenme bonus: take the max); cumulative rest timer; at 60 s apply status `rest_comfort` (30 min, `maxHpPct +0.05`, `hpRegen +2`, `resourceRegenPct +0.10`, persisted in `flags['buff.rest']`); rested pool accrual `+1 %` of `xpToNext` per minute while resting (via `CharacterState.addRested`); optional `ateş korkusu` aggro multiplier hook (`EnemyAI` reads `Camping.isResting` — **not** edited here, only the exported query).
- **Done when:** `dev/combat.html` shows regen numbers, the buff after 60 s and the XP pool filling; tsc clean.

**IT-53 — Camp HUD** · owner: **hud** · wave 9 · deps: IT-51, IT-50 · size S
- **Files:** **new** `src/ui/hud/CampChip.ts`, `src/ui/hud/index.ts` (register only), `src/ui/hud/Bars.ts` or the file that draws the XP bar (rested segment), **new** `src/ui/styles/hud-camp.css`, `src/dev/hud.ts`.
- **Tasks:** chip "Kamp 12:40" (tent icon, red when < 60 s), buff icons `rest_comfort`, minimap marker `camp` (own gold, party blue) if the minimap exposes markers, XP bar lighter segment for the rested pool.
- **Done when:** the chip, icons and segment render with fake data in `dev/hud.html`; tsc clean.

**IT-46 — Ejderha Taşları system** · owner: **items** · wave 9 · deps: IT-01, IT-41 · size M
- **Files:** `src/data/dragonStones.ts` (flip `DRAGON_ENABLED = true`), `src/systems/DragonSouls.ts` (new), `src/systems/StatCalc.ts`, `src/systems/CharacterState.ts` (`dragon: (string | null)[6]` in `flags['dragon.slots']` JSON).
- **Tasks:** tables of §4.6; `equipStone(slot, id)`, `unequipStone(slot)`, `refine(color, grade)` (success 80 / 60 / 40 %, failure consumes 1 of 3 and +10 pp luck up to +30, cost gold `2,000 / 10,000 / 40,000`, Büyülü Toz `4 / 10 / 25`), `dragonStats(slots): StatBlock` with the ×1.25 same-colour rule and the Gökkuşağı Ruhu bonus; `StatCalc` folds it; the drops (Metin stones 6 %, Patron 3 %, M+ boss 8 % grade 2, raid 10 % grade 3) and the Kalıntı Tüccarı offer already exist in IT-05 behind `DRAGON_ENABLED`, so this package only flips the flag.
- **Done when:** headless numbers match §4.6 incl. refine odds (simulation), total ≤ 250 BP; tsc clean.

#### Wave 10 (P3)

**IT-47 — Ejderha Ruhu tab** · owner: **panels-items** · wave 10 · deps: IT-46 · size S
- **Files:** `src/ui/panels/items/CharacterPanel.ts`, **new** `src/ui/panels/items/DragonTab.ts`, **new** `src/ui/styles/forge-dragon.css`.
- **Tasks:** tab "Ejderha Ruhu" (level 40): six slots, stone picker, colour-bonus readout, **Simya** area (3 → 1 with odds and luck meter); tooltips for stones.
- **Done when:** fixtures show equip / unequip / refine with forced outcomes; tsc clean.

**IT-54 — Death panel respawn buttons** · owner: **panels-game** · wave 10 · deps: IT-51 · size S
- **Files:** `src/ui/panels/game/death.ts`.
- **Tasks:** extra buttons "Kampta Dirilt" (if `Camping.respawnPoint()`; costs 3 min fuel) and "Evde Dirilt" (if `G.character.save.home` exists; hidden until IT-57), emitting `player:releaseRequested` with `{ at: 'camp' | 'home' | 'stone' }` (scenes handle the teleport: IT-51 for camp, IT-57 for home).
- **Done when:** buttons appear / hide by state in `dev/panels-game.html`; tsc clean.

**IT-55 — Housing data and system** · owner: **items** · wave 10 · deps: IT-01, IT-50 · size M
- **Files:** `src/data/homeProps.ts` (flip `HOME_ENABLED = true`), `src/systems/Housing.ts` (new), `src/systems/CharacterState.ts` (`home` accessors), `src/systems/Vendor.ts` (Emlakçı entries, flag-guarded), `src/dev/items.ts`.
- **Tasks:** `HOME_TIERS` (§5.2.1), `HOME_PROPS` (the ≈ 35 rows of §5.2.3 in a **fixed append-only order**; the index is the wire id), `buyHouse(tier)`, `sellHouse()` (50 %), `buyProp(id)`, `placeProp(index, gx, gz, rot): { ok; reason? }` (slot cap, bounds, collision against footprints), `removeProp(i)`, `snapshot(): HomeSnapshot`, `validateSnapshot(raw): HomeSnapshot | null`, trophies `recordTrophy(bossId, bit)` from `run:completed` / `boss:defeated`, home stash get / set, `ev_tasi` grant.
- **Done when:** headless: purchase / sell numbers, slot caps, collision, snapshot round-trip (≤ 4 KB for 120 placements), invalid snapshot rejected; tsc clean.

#### Wave 11 (P3)

**IT-56 — Home interiors and town content** · owner: **content** · wave 11 · deps: IT-55 · size M
- **Files:** **new** `src/data/dungeons/homes.ts`, `src/data/dungeons/index.ts` (register), `src/data/town.ts` (NPC `npc_emlakci` Emlakçı Rıza role `'home'` + the Kuzgunkale Konağı door prop, per §5.2.1 suggestions), `src/data/world/*` village data only where the house door props are added (Gümüşdere Köylü Evi 3, Kızılkaya Karakol Evi 1).
- **Tasks:** three `DungeonDef`s (`home_kulube` 12 × 8 m 1 room, `home_karakol` 16 × 12 m 2 rooms, `home_konak` 24 × 16 m 3 rooms), `home: true`, no packs / bosses, warm interior light, start + exit portal + Dekor Defteri marker positions; door props with `ui: { panel: 'home', data: { tab: 'enter' } }`.
- **Done when:** the three defs load in `dev/content.html` / `dev/world.html`, doors are placed 3–6 m from related NPCs, `contentCheck` passes; tsc clean.

**IT-58 — `home` panel** · owner: **panels-game** · wave 11 · deps: IT-55 · size L
- **Files:** **new** `src/ui/panels/game/home.ts`, `src/ui/panels/game/index.ts` (register), **new** `src/ui/styles/panels-home.css`, `src/dev/panels-game.ts`.
- **Tasks:** tabs *Satın Al* (tier cards, price, requirement, sell), *Mağaza* (catalogue by category), *Dekor* (edit mode: catalogue → ghost, grid / rotate / remove through events consumed by IT-57, slot counter, "Geri al"), *Kupalar* (plaques list); `G.ui.openPanel('home', { tab? })`.
- **Done when:** with fixtures every tab works against `Housing` (mock scene events); tsc clean.

**IT-59 — Ev Taşı and use-actions** · owner: **items + panels-items** · wave 11 · deps: IT-55 · size S
- **Files:** `src/ui/panels/items/actions.ts`, `src/systems/CharacterState.ts` (`useItem` branch for `ev_tasi`, `kamp_takimi`).
- **Tasks:** consumable use for `kamp_takimi` (calls `Camping.place` through an event `camp:place`) and `ev_tasi` (10 s channel, 30 min cooldown in `camp.hearthAt`, open world / town only, emits `home:teleport` for scenes to handle); tooltips.
- **Done when:** use rules and cooldowns verified headless; tsc clean.

#### Wave 12 (P3)

**IT-57 — HomeRuntime and net `home`** · owner: **scenes** · wave 12 · deps: IT-55, IT-56, IT-58 · size L
- **Files:** **new** `src/scenes/HomeRuntime.ts`, **new** `src/entities/interactables/{HouseDoor,HomeProp,HomeStation,Mannequin,TrophyWall}.ts`, `src/entities/interactables/index.ts`, `src/scenes/DungeonScene.ts` (home branch only), `src/scenes/SceneTown.ts` (door wiring, `home:teleport`), `src/dev/scenes.ts`.
- **Tasks:** build the interior from a `HomeSnapshot` (props via `Assets.instantiate`, merged where static, `LightPool` for lamps / braziers), edit-mode controller consuming the IT-58 events (ghost, grid 0.5 m, rotate, collision), stations as `PanelProp`s, `hx_depo` opens the viewer's stash, `hx_stash` owner-only, mannequins (`loadCharacterModel` clone + `setGear` → armor glow), weapon rack, trophy wall (`CanvasTexture` plaques), bed (`Lie_Down`, rested, respawn flag), exit portal back to `returnTo`; party entry via `requestSceneFromHost('dungeon', { dungeonId, homeOwner, returnTo })`; net channel `home` send / receive (§5.2.7: `deco`, `mq`, `tro`, `req`, chunking ≤ 4 KB, `validateSnapshot`); `home:entered/left`, `home:teleport`, respawn at the door; "Evde Dirilt".
- **Done when:** two tabs: the owner decorates, the visitor sees the same layout read-only, uses a station and the depot with their own data, leaves with the portal; invalid snapshots are dropped; tsc clean.

### 7.3 File ownership matrix (conflict check)

| Path | W0 | W1 | W2 | W3 | W4 | W5 | W6 | W7 | W8 | W9 | W10 | W11 | W12 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `src/types/*`, `src/core/{events,Settings}.ts`, `ARCHITECTURE.md`, `data/itemVisuals.ts`, stubs | **IT-00** | – | – | – | – | – | – | – | – | – | – | – | – |
| `src/data/{upgradesV2,currencies,efsunSpecial,benchRecipes,materials,upgrades}.ts`, `dev/items.ts` | stub | **IT-01** | – | – | – | – | (IT-41 dev) | – | (IT-45 dev) | – | (IT-55 dev) | – | – |
| `src/vfx/{ArmorShader,ArmorGlow,WeaponGlow,VFX,presets_world}.ts`, `src/audio/*` | – | **IT-10** | – | – | – | – | – | **IT-42** | – | – | – | – | – |
| `src/net/{Replication,NetSession,messages}.ts` | – | **IT-12** | – | – | – | – | – | – | – | – | – | – | – |
| `src/systems/{Upgrade,Stacks}.ts`, `CharacterState.ts` (`upg`) | stub | – | **IT-02** | IT-04 | – | – | – | – | IT-50 | IT-46 | IT-55 | IT-59 | – |
| `src/systems/{Crafting,Quality,ItemGen}.ts` | stub | – | **IT-03** | IT-04 (Upgrade wrappers) | – | – | IT-41 (ItemGen, Crafting) | – | IT-45 (Crafting) | – | – | – | – |
| `src/entities/{armorLook,CharacterModel,Player}.ts` | – | – | **IT-11** | – | – | – | – | – | – | – | – | – | – |
| `src/systems/{Masterwork,ItemLevel}.ts` | stub | – | – | **IT-04** | – | – | – | – | – | – | – | – | – |
| `src/systems/{Vendor,LootSystem,Bounties}.ts`, `data/loot.ts` | – | – | – | **IT-05** | – | – | – | – | – | – | IT-55 (Vendor) | – | – |
| `src/ui/panels/items/{BlacksmithPanel,backend}.ts`, `blacksmith/{index,shared,SocketTab,SalvageTab}.ts` | – | – | – | **IT-30** | – | – | – | IT-44 (SocketTab) | – | – | – | – | – |
| `blacksmith/{UpgradeTab,Ceremony}.ts`, `ForgeFx.ts`, `forge-upgrade.css` | – | – | – | – | **IT-31** | – | – | – | – | – | – | – | – |
| `blacksmith/{EfsunTab,CraftTab,EfsunList}.ts`, `forge-efsun.css` | – | – | – | – | **IT-32** | – | – | – | – | – | – | – | – |
| `ui/panels/items/{common,CharacterPanel}.ts`, `forge-tooltip.css` | – | – | – | – | **IT-33** | – | – | IT-44 (CharacterPanel) | – | – | IT-47 (CharacterPanel) | – | – |
| `ui/hud/{Announce,CampChip}.ts`, `ui/hud/index.ts` | – | – | – | – | – | **IT-13** | – | – | – | IT-53 | – | – | – |
| `scenes/SceneTown.ts`, `entities/NPC.ts` | – | – | – | – | – | **IT-14** | – | – | – | – | – | – | IT-57 (SceneTown) |
| `ui/panels/game/settings.ts` | – | – | – | – | – | **IT-16** | – | – | – | – | – | – | – |
| `entities/LootDrop.ts` | – | – | – | – | – | – | **IT-15** | – | – | – | – | – | – |
| `data/tilsim.ts`, `systems/Tilsim.ts` | stub | – | – | – | – | – | **IT-40** | – | – | – | – | – | – |
| `data/engravings.ts`, `systems/{Engravings,StatCalc}.ts` | stub | – | – | – | – | – | **IT-41** | – | – | IT-46 (StatCalc) | – | – | – |
| `combat/{specials,Combat}.ts`, `data/statuses.ts` | – | – | – | – | – | – | – | **IT-43** | – | IT-52 | – | – | – |
| `data/camp.ts`, `data/recipes.ts`, `systems/Progression.ts` | stub | – | – | – | – | – | – | – | **IT-50** | – | – | – | – |
| `scenes/Camping.ts`, `interactables/CampSite.ts`, `scenes/DungeonScene.ts` | – | – | – | – | – | – | – | – | **IT-51** | – | – | – | IT-57 (home branch) |
| `data/dragonStones.ts`, `systems/DragonSouls.ts` | stub | – | – | – | – | – | – | – | – | **IT-46** | – | – | – |
| `ui/panels/game/{death,home}.ts` | – | – | – | – | – | – | – | – | – | – | IT-54 (death) | IT-58 (home) | – |
| `data/homeProps.ts`, `systems/Housing.ts` | stub | – | – | – | – | – | – | – | – | – | **IT-55** | – | – |
| `data/dungeons/{homes,index}.ts`, `data/town.ts` | – | – | – | – | – | – | – | – | – | – | – | **IT-56** | – |
| `scenes/HomeRuntime.ts`, `interactables/{HouseDoor,…}.ts` | – | – | – | – | – | – | – | – | – | – | – | – | **IT-57** |

Inside a wave no path appears twice (bold = the owner of that wave). `CharacterState.ts` is touched by one package per wave at most (IT-02 `upg`, IT-04 delegates, IT-50 `camp`, IT-46 `dragon`, IT-55 `home`, IT-59 `useItem`), and `Crafting.ts` by IT-03 (wave 2), IT-41 (wave 6) and IT-45 (wave 8) only (the efsun wrappers live in `Upgrade.ts`, edited by IT-02 and IT-04).

### 7.4 Dependencies in one line

`IT-00 → {IT-01, IT-10, IT-12} → {IT-02 (01), IT-03 (01), IT-11 (10)} → {IT-04 (02, 03), IT-05 (01), IT-30 (00)} → {IT-31 (02, 04, 30), IT-32 (03, 30), IT-33 (03, 11)} → {IT-13 (12), IT-14 (10, 02), IT-16 (00)} → QA-A → {IT-15 (03), IT-40 (03), IT-41 (03)} → {IT-42 (10, 11), IT-43 (40, 41), IT-44 (40, 41, 33)} → QA-B → {IT-45 (03), IT-50 (01), IT-51 (10, 50)} → {IT-52 (51), IT-53 (50, 51), IT-46 (01, 41)} → {IT-47 (46), IT-54 (51), IT-55 (01, 50)} → {IT-56 (55), IT-58 (55), IT-59 (55)} → IT-57 (55, 56, 58) → QA-C`.

### 7.5 QA checklist per gate (Haiku smoke test, one browser tab, low CPU, ROADMAP loop protocol)

* **QA-A (P0 + P1):** `dev/vfx.html` armor rows for all four GLBs (no console errors, no magenta, hit flash still works); `dev/items.html` simulations and assertions green; `dev/panels-items.html` blacksmith: upgrade with forced outcomes (every banner), Talih bar and stones, scrolls, Kırık / repair, Ustalık, efsun slots 6 / 7 flows, Zanaat orbs and Tezgâh, tooltips of all rarities; `dev/hud.html` announce banner; `dev/net.html` two tabs: remote armor glow and announcements; real game: equip a +9 chest in town, walk, fight, check frame time (≥ 55 fps on the reference machine with 3 characters glowing).
* **QA-B (P2):** Tılsım procs, Kazıma totals and BP audit, base-tier tints readable.
* **QA-C (P3):** camp place / refuel / respawn, rested XP, house buy / decorate / visit with two tabs, Ev Taşı, Ejderha Ruhu.

### 7.6 Risks and mitigations

| Risk | Mitigation |
|---|---|
| The injected GLSL does not compile on one material type (Standard vs Lambert) | `attachArmorShader` patches only Standard / Lambert / Phong with `map`; on a compile error (`onShaderError`) the handle disables itself and logs once; the dev page has a "shader sağlık" log line |
| The bone-prefix map does not match the real bone names | the slot-debug view (§1.2) is the acceptance test; the map is data in `ArmorShader.ts` (`SLOT_BY_BONE`) and can be adjusted without touching GLSL |
| Palette swatches smaller than the 512² mask resolution | fall back to a 1024² mask (constant `ARMOR_MASK_SIZE`) |
| `Material.clone()` drops the patch somewhere else in the code | `ArmorGlows.set` re-checks `ARMOR_UNIFORMS` membership on every call (cheap) and re-attaches |
| Upgrade economy is too grindy | all numbers are data (`upgradesV2.ts`); the simulation page and §2.11 give the expected costs; first lever is the Ruh Taşı count of the table (unchanged from GDD_SYSTEMS) |
| GDD_V2 WP3 (orbs) lands later than IT-03 | `Crafting.ts` guards every orb by `MATERIALS[id]` existence; IT-01 adds the orb materials if missing |
| GDD_LIFE L-32 (chat rewrite) conflicts with IT-12 | IT-12 is written against the `chat` handler as found; if L-32 is merged first it plugs `ann` into `sendChat` instead (noted in the package) |
| Net payload growth from 5 more gear slots | change-driven only, ≈ 450 bytes; verified in `dev/net.html` |

---

## Appendix A. Type and data sketches (copy-paste for IT-00)

```ts
// ---- types/itemsV2.ts (NEW, core) ----
import type { ClassId, Rarity } from './common';
import type { EquipSlot, ItemInstance } from './items';

/** Slot order of every 6-array: helm, shoulders, chest, gloves, legs, boots. */
export type ArmorLevels = [number, number, number, number, number, number];
export interface ArmorLook {
  lv: ArmorLevels;                                   // per-slot upgrade level (0 = empty / broken / hidden)
  body: number;                                      // weighted average (chest x2), rounded half-up
  set: { id: string; count: number; total: number; color: number } | null;
  tint?: (number | null)[];                          // P2 base-tier tint per slot
}
export interface UpgLogEntry { t: number; name: string; from: number; to: number; res: 0 | 1 | 2 | 3 | 4 | 5; ch: number }   // res: stay, success, down, destroyed/broken, protected, pity
export interface UpgState { stacks: number; fails: number; wins: number; destroyStreak: number; best: number; log: UpgLogEntry[] }   // CharacterSave.upg
export interface QualityInfo { q: number; band: 0 | 1 | 2 | 3 | 4 | 5; bandName: string; seal: 0 | 1 | 2 | 3; lines: { id: string; q: number }[] }   // seal: none, Yıldız, Ay, Güneş
export interface PlusStyle { color: string; css: string; anim?: 'flame' | 'rainbow'; stars: number }
export interface ChatAnn { k: 'upg' | 'mw'; n: string; l: number; r: Rarity; c?: ClassId }                 // chat.ann
export interface CampState { rested: number; hearthAt: number }                                           // CharacterSave.camp
export interface HomeSave { tier: string; boughtAt: number; decor: number[][]; owned: Record<string, number>; trophies: Record<string, number>; stash: (ItemInstance | null)[]; mannequins: { slot: number; hide?: boolean }[]; bedRespawn: boolean }
export interface HomeSnapshot { tier: string; decor: number[][]; trophies: Record<string, number>; mannequins?: { cls: ClassId; v: number; g: Partial<Record<EquipSlot, ItemInstance>> }[] }
export type CampMsg = { o: number; k: 0 | 1; x: number; z: number; f: number } | { t: 'req' };            // NetChannels.camp
export type HomeMsg = { o: number; t: 'deco' | 'mq' | 'tro' | 'req'; tier?: string; p?: number[][]; mq?: HomeSnapshot['mannequins']; tr?: Record<string, number>; part?: [number, number] };   // NetChannels.home

// ---- types/items.ts (append) ----
interface RolledAffix { /* + */ s?: number }                                  // S-tier 4..1 for slot-7 lines
interface ItemInstance { /* + */ bench?: RolledAffix | null; special?: RolledAffix | null; mw?: number; tilsim?: string | null;
  eng?: { id: string; pts: number }[]; broken?: boolean; upgradeBroken?: number; exalted?: boolean /* V2 */ }

// ---- types/character.ts (append) ----
interface CharacterSave { /* + */ upg?: UpgState; home?: HomeSave; camp?: CampState }

// ---- types/net.ts (append) ----
// chat: { text: string; ann?: ChatAnn; /* ... GDD_LIFE widening ... */ }   NetChannels += { camp: CampMsg; home: HomeMsg }

// ---- core/events.ts (append) ----
// 'upgrade:attempt': { uid: string; target: number; res: 0 | 1 | 2 | 3 | 4 | 5; chance: number }
// 'upgrade:announce': { from: string; ann: ChatAnn }     'efsun:changed': { uid: string; slot?: number }
// 'camp:placed': { x: number; z: number }   'camp:expired': Record<string, never>   'home:entered': { owner: number }   'home:left': Record<string, never>
// 'item:upgraded' payload gains optional: outcome?: string; stacksBefore?: number; stacksAfter?: number

// ---- core/Settings.ts (append) ----
// armorGlow: 'off' | 'low' | 'high'  (default 'high')      fastForge: boolean  (default false)

// ---- data/itemVisuals.ts (complete in IT-00) ----
export const ARMOR_SLOT_ORDER = ['helm', 'shoulders', 'chest', 'gloves', 'legs', 'boots'] as const;
export const ARMOR_WEIGHTS = [1, 1, 2, 1, 1, 1] as const;
export const bodyLevel = (lv: readonly number[]): number => Math.floor(lv.reduce((s, v, i) => s + v * ARMOR_WEIGHTS[i], 0) / 7 + 0.5);
export const UPGRADE_TIERS = [
  { id: 'none',   min: 0,  name: '',                  color: '#e8e8e8', glowName: '' },
  { id: 'steel',  min: 4,  name: 'Çelik Cila',        color: '#b8d0ff', glowName: 'Çelik Cila parıltısı' },
  { id: 'blue',   min: 7,  name: 'Mavi Titreşim',     color: '#3fa9ff', glowName: 'Mavi parıltı' },
  { id: 'purple', min: 9,  name: 'Mor Rünler',        color: '#b14cff', glowName: 'Mor parıltı' },
  { id: 'flame',  min: 12, name: 'Kızıl-Altın Alev',  color: '#ff4030', glowName: 'Kızıl parıltı' },
  { id: 'prism',  min: 15, name: 'Prizma',            color: '#ffffff', glowName: 'Gökkuşağı parıltı' },
] as const;
export const SEAL_THRESHOLDS = [75, 90, 97] as const;
export const QUALITY_BANDS = [
  { min: 0,  color: '#d9534f', name: 'Zayıf' }, { min: 15, color: '#e8c33a', name: 'Vasat' }, { min: 30, color: '#4ec45a', name: 'İyi' },
  { min: 55, color: '#4aa3ff', name: 'Çok İyi' }, { min: 75, color: '#b565ff', name: 'Mükemmel' }, { min: 90, color: '#ff9a2e', name: 'Kusursuz' },
] as const;
```
