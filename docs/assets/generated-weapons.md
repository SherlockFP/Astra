# Generated weapons (PSX MMO style)

Area: `weapons` - 37 loot / equippable weapons and off-hands, generated headless with Blender 5.2 (`tools/blender/weapons/`). Look: Metin2 / Knight Online / early-WoW low poly, faceted flat shading, one tiny nearest-filtered pixel atlas per asset (procedural numpy painting, max 16 colours = PSX 4-bit CLUT spirit, Bayer dither, dark 1px outlines, painted bevel highlights). Total size 878 KB.

Preview: `docs/assets/previews/weapons.png`

## Conventions

- glTF is +Y up, 1 unit = 1 m = 1 game unit (KayKit scale). Sizes below are glTF **X x Y x Z** (W x H x D) in metres; the attach column also uses glTF axes.
- **Hand-held weapons**: origin = grip point (attach to the hand bone / KayKit `handslot`), blade or head points +Y (Blender +Z); flat of the blade faces glTF +Z/-Z, axe/mace cutting edge toward +X. Two-handers: origin = upper hand, the second hand sits ~0.25-0.4 lower on the grip/haft.
- **Staves**: origin = main-hand grip ~0.8 above the foot, total length 2.2.
- **Crossbows**: like KayKit `crossbow_1handed` they point forward along glTF +Z (Blender -Y); origin = trigger grip under the stock, prod spans X.
- **Bows**: origin = bow grip, limbs along glTF Y, string on the archer side (glTF -Z), arrow flies glTF +Z.
- **Shields**: origin = hand grip bar behind the plate, painted face toward glTF +Z (Blender -Y); plain wood/leather/iron back.
- Materials: one `MeshStandardMaterial`-compatible PBR material per file, baseColor texture (embedded PNG, sampler NEAREST / NEAREST_MIPMAP_NEAREST, GLTFLoader applies it), roughness 0.9, metallic 0, single-sided. Emissive parts use an emissive texture + `KHR_materials_emissive_strength` = 2 so bloom picks them up. No animations (static props).
- Textures are 64x64 (shields 128x128: painted face + plain back + rim strip).

```ts
// three.js example
const gltf = await loader.loadAsync('/assets/models/gen/weapons/sword_1h_dragon.glb');
const weapon = gltf.scene; handBone.add(weapon); // already oriented: blade along +Y, grip at origin
```


## Tek el kılıçlar

| id | URL | Türkçe ad | size W x H x D (m) | tris | anims | KB | intended use | emissive | attach |
|---|---|---|---|---|---|---|---|---|---|
| `sword_1h_rusty` | `/assets/models/gen/weapons/sword_1h_rusty.glb` | Paslı Kısa Kılıç | 0.25 x 1.07 x 0.07 | 174 | - | 14.6 | Starter / trash loot one-handed sword (lvl 1-5) | - | grip centre at origin (hand bone); blade +Y; blade flats face +/-Z |
| `sword_1h_iron` | `/assets/models/gen/weapons/sword_1h_iron.glb` | Demir Kılıç | 0.30 x 1.18 x 0.04 | 266 | - | 16.9 | Common one-handed arming sword (lvl 5-15) | - | grip centre at origin (hand bone); blade +Y; blade flats face +/-Z |
| `sword_1h_scimitar` | `/assets/models/gen/weapons/sword_1h_scimitar.glb` | Pala | 0.25 x 1.15 x 0.04 | 210 | - | 17.0 | Curved Turkish kilij-style sabre with yelman tip (lvl 10-25) | - | grip centre at origin (hand bone); blade +Y; blade flats face +/-Z |
| `sword_1h_knight` | `/assets/models/gen/weapons/sword_1h_knight.glb` | Şövalye Kılıcı | 0.36 x 1.22 x 0.07 | 308 | - | 18.9 | Ornate knight sword, gold guard + sapphire (lvl 20-35) | - | grip centre at origin (hand bone); blade +Y; blade flats face +/-Z |
| `sword_1h_jade` | `/assets/models/gen/weapons/sword_1h_jade.glb` | Yeşim Kılıcı | 0.16 x 1.33 x 0.12 | 196 | - | 16.2 | Eastern (Metin2 style) broad sword, jade tsuba, glowing glyphs (lvl 30-45) | jade glyphs on blade root | grip centre at origin (hand bone); blade +Y; blade flats face +/-Z |
| `sword_1h_dragon` | `/assets/models/gen/weapons/sword_1h_dragon.glb` | Ejder Kılıcı | 0.48 x 1.33 x 0.07 | 516 | - | 31.6 | Legendary dragon blade, serrated spine, burning runes + ruby (lvl 50+) | rune channel along blade (orange), ruby in guard | grip centre at origin (hand bone); blade +Y; blade flats face +/-Z |

## Çift el kılıçlar

| id | URL | Türkçe ad | size W x H x D (m) | tris | anims | KB | intended use | emissive | attach |
|---|---|---|---|---|---|---|---|---|---|
| `sword_2h_claymore` | `/assets/models/gen/weapons/sword_2h_claymore.glb` | Büyük Kılıç (Klaymor) | 0.54 x 1.99 x 0.08 | 310 | - | 19.4 | Two-handed claymore, iron guard with lobed arms (lvl 15-30) | - | upper-hand grip at origin; blade +Y; second hand ~0.25 lower on the grip |
| `sword_2h_flamberge` | `/assets/models/gen/weapons/sword_2h_flamberge.glb` | Dalgalı Büyük Kılıç (Flamberg) | 0.55 x 2.14 x 0.08 | 540 | - | 34.9 | Wavy-bladed two-hander with parrying hooks (lvl 30-45) | - | upper-hand grip at origin; blade +Y; second hand ~0.25 lower on the grip |
| `sword_2h_demon` | `/assets/models/gen/weapons/sword_2h_demon.glb` | İblis Kılıcı | 0.50 x 2.18 x 0.09 | 498 | - | 34.7 | Cursed demonic greatsword, barbed black blade, violet runes (raid/boss loot) | violet rune channel, demon eyes + forehead gem | upper-hand grip at origin; blade +Y; second hand ~0.25 lower on the grip |

## Tek el baltalar

| id | URL | Türkçe ad | size W x H x D (m) | tris | anims | KB | intended use | emissive | attach |
|---|---|---|---|---|---|---|---|---|---|
| `axe_1h_hatchet` | `/assets/models/gen/weapons/axe_1h_hatchet.glb` | El Baltası | 0.27 x 0.97 x 0.06 | 164 | - | 13.1 | Basic woodsman hatchet, starter one-handed axe (lvl 1-8) | - | grip at origin near the handle end; head +Y; cutting edge toward +X |
| `axe_1h_bearded` | `/assets/models/gen/weapons/axe_1h_bearded.glb` | Sakallı Balta | 0.26 x 1.08 x 0.06 | 316 | - | 23.0 | Northern bearded axe with bronze collars (lvl 10-25) | - | grip at origin near the handle end; head +Y; cutting edge toward +X |
| `axe_1h_crescent` | `/assets/models/gen/weapons/axe_1h_crescent.glb` | Hilal Balta | 0.43 x 1.17 x 0.05 | 382 | - | 26.7 | Ornate crescent-moon axe, blued steel and gold (lvl 25-40) | - | grip at origin near the handle end; head +Y; cutting edge toward +X |

## Çift el baltalar

| id | URL | Türkçe ad | size W x H x D (m) | tris | anims | KB | intended use | emissive | attach |
|---|---|---|---|---|---|---|---|---|---|
| `axe_2h_battle` | `/assets/models/gen/weapons/axe_2h_battle.glb` | Çift Ağızlı Savaş Baltası | 0.66 x 2.01 x 0.08 | 228 | - | 17.5 | Double-bitted two-handed battle axe (lvl 15-35) | - | upper-hand grip at origin; head +Y; lower hand ~0.3-0.4 below on the haft |
| `axe_2h_executioner` | `/assets/models/gen/weapons/axe_2h_executioner.glb` | Cellat Baltası | 0.55 x 2.15 x 0.08 | 330 | - | 24.9 | Huge executioner axe, blood-stained edge (lvl 30-45 / elite drop) | - | upper-hand grip at origin; head +Y; lower hand ~0.3-0.4 below on the haft |
| `axe_2h_infernal` | `/assets/models/gen/weapons/axe_2h_infernal.glb` | Cehennem Baltası | 0.59 x 1.96 x 0.13 | 336 | - | 27.1 | Infernal great axe, jagged black blades with molten edges (boss loot) | molten blade edges + cracks, lava gem in socket | upper-hand grip at origin; head +Y; lower hand ~0.3-0.4 below on the haft |

## Topuzlar / çekiç

| id | URL | Türkçe ad | size W x H x D (m) | tris | anims | KB | intended use | emissive | attach |
|---|---|---|---|---|---|---|---|---|---|
| `mace_flanged` | `/assets/models/gen/weapons/mace_flanged.glb` | Dişli Topuz | 0.20 x 1.07 x 0.22 | 474 | - | 27.2 | One-handed flanged mace (cleric / warrior, lvl 10-25) | - | grip at origin near the handle end; head +Y |
| `mace_morningstar` | `/assets/models/gen/weapons/mace_morningstar.glb` | Çivili Gürz | 0.32 x 1.14 x 0.32 | 370 | - | 30.2 | Spiked morning-star mace, iron-banded wooden haft (lvl 15-30) | - | grip at origin near the handle end; head +Y |
| `hammer_2h_thunder` | `/assets/models/gen/weapons/hammer_2h_thunder.glb` | Gök Gürültüsü Çekici | 0.57 x 1.78 x 0.25 | 472 | - | 31.3 | Two-handed war hammer with storm runes (lvl 35-50) | cyan lightning runes on both head faces | upper-hand grip at origin; head +Y; lower hand ~0.3-0.4 below on the haft |

## Asalar

| id | URL | Türkçe ad | size W x H x D (m) | tris | anims | KB | intended use | emissive | attach |
|---|---|---|---|---|---|---|---|---|---|
| `staff_wood` | `/assets/models/gen/weapons/staff_wood.glb` | Ağaç Asa | 0.25 x 2.20 x 0.14 | 376 | - | 27.2 | Gnarled druid / novice staff with curled head and leaves (lvl 1-15) | - | main-hand grip at origin (~0.8 above the foot); head +Y; length 2.2 |
| `staff_crystal` | `/assets/models/gen/weapons/staff_crystal.glb` | Kristal Asa | 0.16 x 2.20 x 0.14 | 452 | - | 34.7 | Arcane mage staff, silver claws holding a glowing crystal (lvl 15-35) | crystal (cyan) | main-hand grip at origin (~0.8 above the foot); head +Y; length 2.2 |
| `staff_fire` | `/assets/models/gen/weapons/staff_fire.glb` | Ateş Asası | 0.31 x 2.20 x 0.11 | 622 | - | 42.8 | Fire mage staff, gold ring with burning orb and flame prongs (lvl 25-45) | orb + flame prongs (orange/yellow) | main-hand grip at origin (~0.8 above the foot); head +Y; length 2.2 |
| `staff_frost` | `/assets/models/gen/weapons/staff_frost.glb` | Buz Asası | 0.24 x 2.20 x 0.17 | 422 | - | 32.3 | Frost mage staff, silver cradle with a cluster of glowing ice shards (lvl 25-45) | ice crystal cluster (pale blue) | main-hand grip at origin (~0.8 above the foot); head +Y; length 2.2 |
| `staff_skull` | `/assets/models/gen/weapons/staff_skull.glb` | Kafatası Asası | 0.36 x 2.20 x 0.15 | 562 | - | 39.6 | Necromancer staff, horned skull with glowing soul eyes (lvl 30-50) | skull eyes (soul green) | main-hand grip at origin (~0.8 above the foot); head +Y; length 2.2 |

## Değnekler

| id | URL | Türkçe ad | size W x H x D (m) | tris | anims | KB | intended use | emissive | attach |
|---|---|---|---|---|---|---|---|---|---|
| `wand_bone` | `/assets/models/gen/weapons/wand_bone.glb` | Kemik Değnek | 0.08 x 0.66 x 0.07 | 234 | - | 19.5 | Necromancer wand, bone shaft with a violet soul orb (lvl 10-30) | violet orb | grip at origin; tip +Y |
| `wand_arcane` | `/assets/models/gen/weapons/wand_arcane.glb` | Yıldız Değneği | 0.14 x 0.73 x 0.06 | 306 | - | 21.5 | Arcane wand, dark wood with a golden star and glowing sapphire (lvl 15-35) | sapphire in the star | grip at origin; tip +Y |

## Hançerler

| id | URL | Türkçe ad | size W x H x D (m) | tris | anims | KB | intended use | emissive | attach |
|---|---|---|---|---|---|---|---|---|---|
| `dagger_iron` | `/assets/models/gen/weapons/dagger_iron.glb` | Demir Hançer | 0.13 x 0.58 x 0.04 | 118 | - | 10.1 | Plain iron dagger, rogue starter / off-hand (lvl 1-12) | - | grip centre at origin; blade +Y; dual-wield: mirror the off-hand copy on X if needed |
| `dagger_curved` | `/assets/models/gen/weapons/dagger_curved.glb` | Kıvrık Hançer | 0.14 x 0.59 x 0.04 | 234 | - | 16.3 | Ottoman-style curved khanjar, ivory grip and gold fittings (lvl 15-30) | - | grip centre at origin; blade +Y; dual-wield: mirror the off-hand copy on X if needed |
| `dagger_assassin` | `/assets/models/gen/weapons/dagger_assassin.glb` | Suikastçı Hançeri | 0.12 x 0.63 x 0.03 | 286 | - | 20.6 | Black sawback assassin dagger with glowing poison groove (lvl 25-45) | poison groove (green) | grip centre at origin; blade +Y; dual-wield: mirror the off-hand copy on X if needed |
| `dagger_ritual` | `/assets/models/gen/weapons/dagger_ritual.glb` | Kurban Hançeri | 0.12 x 0.61 x 0.05 | 238 | - | 18.9 | Wavy kris ritual dagger, bone grip, glowing ruby pommel (lvl 30-50) | ruby pommel + guard stone | grip centre at origin; blade +Y; dual-wield: mirror the off-hand copy on X if needed |

## Arbaletler

| id | URL | Türkçe ad | size W x H x D (m) | tris | anims | KB | intended use | emissive | attach |
|---|---|---|---|---|---|---|---|---|---|
| `crossbow_light` | `/assets/models/gen/weapons/crossbow_light.glb` | Hafif Arbalet | 0.81 x 0.16 x 0.95 | 202 | - | 16.3 | Light hunting crossbow, wood stock with steel prod (lvl 5-25) | - | trigger grip at origin; points forward +Z like KayKit crossbow_1handed; prod across X; up +Y |
| `crossbow_heavy` | `/assets/models/gen/weapons/crossbow_heavy.glb` | Ağır Arbalet | 1.01 x 0.21 x 1.28 | 358 | - | 26.3 | Heavy siege-style crossbow with windlass and iron fittings (lvl 25-45) | - | trigger grip at origin; points forward +Z like KayKit crossbow_1handed; prod across X; up +Y |

## Yaylar

| id | URL | Türkçe ad | size W x H x D (m) | tris | anims | KB | intended use | emissive | attach |
|---|---|---|---|---|---|---|---|---|---|
| `bow_short` | `/assets/models/gen/weapons/bow_short.glb` | Kısa Yay | 0.05 x 1.20 x 0.19 | 168 | - | 13.7 | Simple wooden self bow for hunters / novice archers (lvl 1-20) | - | bow grip at origin; limbs along +/-Y; string on the archer side (-Z); arrow flies +Z |
| `bow_composite` | `/assets/models/gen/weapons/bow_composite.glb` | Türk Yayı | 0.06 x 1.27 x 0.18 | 324 | - | 24.6 | Turkish composite recurve bow, red lacquer with gold, horn siyahs (lvl 25-50) | - | bow grip at origin; limbs along +/-Y; string on the archer side (-Z); arrow flies +Z |

## Kalkanlar

| id | URL | Türkçe ad | size W x H x D (m) | tris | anims | KB | intended use | emissive | attach |
|---|---|---|---|---|---|---|---|---|---|
| `shield_round_wood` | `/assets/models/gen/weapons/shield_round_wood.glb` | Yuvarlak Tahta Kalkan | 0.98 x 0.98 x 0.25 | 226 | - | 23.3 | Round plank shield with iron rim and boss (lvl 1-15) | - | hand grip bar at origin behind the plate (off-hand bone); painted face +Z; up +Y |
| `shield_kite_crest` | `/assets/models/gen/weapons/shield_kite_crest.glb` | Arma Kalkanı | 0.80 x 1.25 x 0.16 | 148 | - | 17.0 | Knightly kite shield, blue field with a golden double-headed eagle crest (lvl 15-35) | - | hand grip bar at origin behind the plate (off-hand bone); painted face +Z; up +Y |
| `shield_tower` | `/assets/models/gen/weapons/shield_tower.glb` | Kule Kalkanı | 0.84 x 1.30 x 0.23 | 174 | - | 18.2 | Tall curved tower shield, iron-banded with a sun boss (tank, lvl 20-45) | - | hand grip bar at origin behind the plate (off-hand bone); painted face +Z; up +Y |
| `shield_demon_spiked` | `/assets/models/gen/weapons/shield_demon_spiked.glb` | İblis Kalkanı | 1.26 x 1.45 x 0.37 | 298 | - | 29.8 | Spiked demon-face shield with horns and glowing eyes (raid / boss loot) | demon eyes (orange-red) | hand grip bar at origin behind the plate (off-hand bone); painted face +Z; up +Y |

## Regenerate

```bash
B="/c/Program Files/Blender Foundation/Blender 5.2/blender.exe"
"$B" --background --factory-startup --python tools/blender/weapons/gen_weapons.py -- public/assets/models/gen/weapons tools/blender/weapons/_meta            # all (or add id filters, e.g. sword staff_fire)
"$B" --background --factory-startup --python tools/blender/weapons/preview.py -- public/assets/models/gen/weapons docs/assets/previews/weapons.png --width 2400 --label 0.06
python tools/blender/weapons/make_doc.py
node tools/glb-inspect.mjs public/assets/models/gen/weapons --short
```

Files: `wlib.py` (mesh builder, pixel painters, palette reduction, export), `wparts.py` (blades, guards, grips, pommels), `w_swords.py`, `w_axes.py` (axes, maces, hammer), `w_staves.py` (staves, wands), `w_daggers.py`, `w_ranged.py` (crossbows, bows), `w_shields.py`, `gen_weapons.py` (driver), `preview.py` (EEVEE contact sheet), `make_doc.py` (this file).
