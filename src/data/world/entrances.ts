import type { EntranceDef, TownProp } from '../../types/dungeons';
import { dg, gp, hw, kc, kf, kg, kn } from '../dungeons/kit';

/**
 * Dungeon entrances: the look recipes (P-10) and the season-pool entrance defs (K19).
 *
 * RECIPES. Every `EntranceDef.look` has one recipe here (`ENTRANCE_RECIPES` is typed as a full Record, so a new look without a
 * recipe is a compile error). A recipe returns the dressing of the gate in the LOCAL frame: door centre at the origin, +z toward
 * the approach, metres, `rot` in degrees. The caller rotates the set by `EntranceDef.facing` and places it at the entrance
 * position. The `Portal` interactable (the door itself, `gp('mplus_portal')`) is NOT part of a recipe: the caller places it at
 * the origin. Nothing is wired into a map yet (WorldDecor / EntranceGate integration is a later package).
 *
 * Asset paths come from the kit helpers (`src/data/dungeons/kit.ts`), so the voxel remap applies as for every other prop.
 *
 * SEASON ENTRANCES. The eight season dungeons get their entrance defs here with placeholder positions and `pending: true`.
 * Their endgame zones (Karakır Bozkırı, Kadim Diyar) are not built, so nothing reads these defs yet.
 */

type Recipe = (e: EntranceDef) => TownProp[];

const WARM_TINT = 0xf2a14a;

/** Kemik Mahzeni (crypt): bone-and-stone door, burial niches, skull posts. */
const crypt: Recipe = () => [
  { model: kc('gate'), pos: [0, 0, 0], scale: 1.8, tint: 0x6a6a72 },
  { model: gp('pillar_broken'), pos: [-3.6, 0, 0.5], scale: 1.4, tint: 0x8a8a90, collide: true, radius: 0.8 },
  { model: gp('pillar_broken'), pos: [3.6, 0, 0.5], scale: 1.4, tint: 0x8a8a90, collide: true, radius: 0.8 },
  { model: hw('post_skull'), pos: [-4.4, 0, 2.4] },
  { model: hw('post_skull'), pos: [4.4, 0, 2.4] },
  { model: gp('sarcophagus'), pos: [-6.2, 0, 6], rot: 25, collide: true, box: [2.2, 1.2] },
  { model: gp('gravestone_a'), pos: [6, 0, 5.4], rot: -15, scale: 1.2 },
  { model: gp('bone_pile'), pos: [2.6, 0, 3.8] },
  { model: hw('ribcage'), pos: [-2.4, 0, 4.6], rot: 90 },
  { model: gp('chains_hanging'), pos: [0, 4.6, -0.4] },
  { model: gp('brazier'), pos: [-3.2, 0, 5.2], tint: WARM_TINT, light: { color: 0x7affc0, intensity: 1.6, distance: 10 } },
  { model: gp('brazier'), pos: [3.2, 0, 5.2], tint: WARM_TINT, light: { color: 0x7affc0, intensity: 1.6, distance: 10 } },
];

/** Kızıl Dökümhane (forge): furnace mouth in black stone, anvil, iron chains. */
const forge: Recipe = () => [
  { model: kc('gate'), pos: [0, 0, 0], scale: 1.8, tint: 0x5a4038 },
  { model: gp('pillar_broken'), pos: [-3.8, 0, 0.5], scale: 1.5, tint: 0x4a3028, collide: true, radius: 0.8 },
  { model: gp('pillar_broken'), pos: [3.8, 0, 0.5], scale: 1.5, tint: 0x4a3028, collide: true, radius: 0.8 },
  { model: gp('chains_hanging'), pos: [-3, 4.2, 0] },
  { model: gp('chains_hanging'), pos: [3, 4.2, 0] },
  { model: gp('forge'), pos: [-5.4, 0, 3.6], rot: 20, collide: true, radius: 1.2, light: { color: 0xff6a30, intensity: 2.0, distance: 9, y: 1.4 } },
  { model: gp('anvil'), pos: [5.6, 0, 4.2], rot: -30, collide: true, radius: 0.8 },
  { model: gp('barrel'), pos: [7.6, 0, 6.5] },
  { model: gp('crate_a'), pos: [-7.4, 0, 6.8], rot: 10 },
  { model: gp('brazier'), pos: [0, 0, 6.2], tint: WARM_TINT, light: { color: 0xff6a30, intensity: 1.8, distance: 10 } },
];

/** Cave mouth (generic, the default for an entrance without a look of its own). */
const cave: Recipe = () => [
  { model: kn('cliff_cave_rock'), pos: [0, 0, -1], scale: 2.2 },
  { model: gp('rock_large'), pos: [-6, 0, 2], scale: 1.4 },
  { model: gp('rock_large'), pos: [6, 0, 2], scale: 1.4 },
  { model: gp('rock_medium'), pos: [-3.4, 0, 5.2] },
  { model: gp('rock_medium'), pos: [3.6, 0, 5.4] },
  { model: gp('campfire'), pos: [0, 0, 7.4], light: { color: 0xffa050, intensity: 1.4, distance: 9, flicker: true, y: 0.8 } },
];

/** Buz Mağarası (ice): frozen cave with blue crystal clusters. */
const ice: Recipe = () => [
  { model: kn('cliff_cave_stone'), pos: [0, 0, -1], scale: 2.2, tint: 0xb8e0ff },
  { model: gp('crystal_blue'), pos: [-4.6, 0, 2.4], scale: 1.6, tint: 0xa8d8ff, emissive: 0x80c8ff, emissiveIntensity: 0.6 },
  { model: gp('crystal_blue'), pos: [4.6, 0, 2.4], scale: 1.6, tint: 0xa8d8ff, emissive: 0x80c8ff, emissiveIntensity: 0.6 },
  { model: kn('rock_tallA'), pos: [-6.8, 0, -2.6], scale: 1.2, tint: 0xd8f0ff },
  { model: kn('rock_tallA'), pos: [6.8, 0, -2.6], scale: 1.2, tint: 0xd8f0ff },
  { model: gp('crystal_blue'), pos: [0, 0, 5.4], scale: 1.1, tint: 0xa8d8ff, light: { color: 0x80c8ff, intensity: 1.6, distance: 10, y: 2.2 } },
];

/** Temple gate (standard): stone arch, obelisk pillars, wide stairs up to the door. */
const temple: Recipe = () => [
  { model: kc('gate'), pos: [0, 0, 0], scale: 2.2, tint: 0xe8e0d0 },
  { model: kg('pillar-obelisk'), pos: [-5, 0, -0.5], scale: 1.6, collide: true, radius: 0.9 },
  { model: kg('pillar-obelisk'), pos: [5, 0, -0.5], scale: 1.6, collide: true, radius: 0.9 },
  { model: kf('lantern'), pos: [-4.4, 4.2, 0.8], tint: 0xffd77a, light: { color: 0xffd77a, intensity: 1.2, distance: 8 } },
  { model: kf('lantern'), pos: [4.4, 4.2, 0.8], tint: 0xffd77a, light: { color: 0xffd77a, intensity: 1.2, distance: 8 } },
  { model: kf('stairs-wide-stone'), pos: [0, 0, 5.5], rot: 0, scale: 1.2 },
  { model: kf('stairs-wide-stone'), pos: [0, 0, 8.2], rot: 0, scale: 1.2 },
  { model: gp('statue_hooded'), pos: [-4.8, 0, 4], tint: 0xe8e0d0 },
  { model: gp('statue_hooded'), pos: [4.8, 0, 4], tint: 0xe8e0d0 },
  { model: gp('brazier'), pos: [-3.6, 0, 9.4], tint: 0xf2e6b0 },
  { model: gp('brazier'), pos: [3.6, 0, 9.4], tint: 0xf2e6b0 },
];

/** Large temple (cathedral-scale gate, used by the Kefaret Salonları look; see the note in the season list). */
const temple_large: Recipe = () => [
  { model: kc('gate'), pos: [0, 0, 0], scale: 3, tint: 0xd8cfc0 },
  { model: kg('pillar-obelisk'), pos: [-7, 0, -1], scale: 2.4, collide: true, radius: 1.2 },
  { model: kg('pillar-obelisk'), pos: [7, 0, -1], scale: 2.4, collide: true, radius: 1.2 },
  { model: gp('banner_red'), pos: [-6, 0, -2], scale: 1.5 },
  { model: gp('banner_red'), pos: [6, 0, -2], scale: 1.5 },
  { model: kf('stairs-wide-stone'), pos: [0, 0, 6], scale: 1.8 },
  { model: kf('stairs-wide-stone'), pos: [0, 0, 9], scale: 1.8 },
  { model: kf('stairs-wide-stone'), pos: [0, 0, 12], scale: 1.8 },
  { model: kg('gravestone-cross-large'), pos: [-9, 0, 8], scale: 1.4 },
  { model: kg('gravestone-cross-large'), pos: [9, 0, 8], scale: 1.4 },
  { model: gp('brazier'), pos: [-6, 0, 13], scale: 1.4, tint: 0xc8382f, light: { color: 0xc8382f, intensity: 2.2, distance: 11 } },
  { model: gp('brazier'), pos: [6, 0, 13], scale: 1.4, tint: 0xc8382f, light: { color: 0xc8382f, intensity: 2.2, distance: 11 } },
  { model: gp('lamp_post'), pos: [-8, 0, 5], scale: 1.6, tint: 0xffc060 },
  { model: gp('lamp_post'), pos: [8, 0, 5], scale: 1.6, tint: 0xffc060 },
];

/** Sky palace (Yıldız Kapısı): pale gate with cyan lanterns and a crystal crown, curved stairs. */
const palace: Recipe = () => [
  { model: kc('gate'), pos: [0, 0, 0], scale: 2.8, tint: 0xd8d0f0 },
  { model: kg('pillar-obelisk'), pos: [-6, 0, -1], scale: 1.6, tint: 0xd8d0f0, collide: true, radius: 1 },
  { model: kg('pillar-obelisk'), pos: [6, 0, -1], scale: 1.6, tint: 0xd8d0f0, collide: true, radius: 1 },
  { model: gp('crystal_purple'), pos: [0, 9, -0.5], scale: 1.2, tint: 0xa070d0, emissive: 0x9a60ff, emissiveIntensity: 0.8 },
  { model: kf('lantern'), pos: [-5, 4, 1], tint: 0x6ac8ff, light: { color: 0x6ac8ff, intensity: 1.4, distance: 9 } },
  { model: kf('lantern'), pos: [5, 4, 1], tint: 0x6ac8ff, light: { color: 0x6ac8ff, intensity: 1.4, distance: 9 } },
  { model: kf('stairs-stone-round'), pos: [0, 0, 5], scale: 3, tint: 0xe0e4ff },
  { model: kf('stairs-stone-round'), pos: [0, 0, 8], scale: 3, tint: 0xe0e4ff },
  { model: kf('stairs-stone-round'), pos: [0, 0, 11], scale: 3, tint: 0xe0e4ff },
  { model: gp('brazier'), pos: [-6, 0, 13], tint: 0x6ac8ff, light: { color: 0x6ac8ff, intensity: 2, distance: 12 } },
  { model: gp('brazier'), pos: [6, 0, 13], tint: 0x6ac8ff, light: { color: 0x6ac8ff, intensity: 2, distance: 12 } },
  { model: gp('lamp_post'), pos: [-8, 0, 6], tint: 0x6ac8ff },
  { model: gp('lamp_post'), pos: [8, 0, 6], tint: 0x6ac8ff },
];

/** Arcane terrace (Büyücüler Terası): twin spires with crystal finials, cyan light, phoenix statues flanking the stairs. */
const arcane: Recipe = () => [
  { model: kc('gate'), pos: [0, 0, 0], scale: 2.8, tint: 0xb8aed8 },
  { model: kc('tower-hexagon-roof'), pos: [-4.6, 0, -0.6], scale: 2.6, tint: 0xb8aed8, collide: true, radius: 1 },
  { model: kc('tower-hexagon-roof'), pos: [4.6, 0, -0.6], scale: 2.6, tint: 0xb8aed8, collide: true, radius: 1 },
  { model: gp('crystal_blue'), pos: [-4.6, 7.2, -0.6], scale: 0.9, emissive: 0x5fd3e8, emissiveIntensity: 1.4, light: { color: 0x5fd3e8, intensity: 2.4, distance: 9 } },
  { model: gp('crystal_blue'), pos: [4.6, 7.2, -0.6], scale: 0.9, emissive: 0x5fd3e8, emissiveIntensity: 1.4 },
  { model: kc('stairs-stone'), pos: [0, 0, 5.5], scale: 2, tint: 0xb8aed8 },
  { model: kc('stairs-stone'), pos: [0, 1, 3.5], scale: 2, tint: 0xb8aed8 },
  { model: kc('stairs-stone'), pos: [0, 2, 1.5], scale: 2, tint: 0xb8aed8 },
  { model: gp('statue_hooded'), pos: [-3.6, 0, 3.4], tint: 0xffd77a, scale: 1.1 },
  { model: gp('statue_hooded'), pos: [3.6, 0, 3.4], tint: 0xffd77a, scale: 1.1 },
  { model: gp('brazier'), pos: [-4.6, 0, 5.2], tint: 0xf2a14a },
  { model: gp('brazier'), pos: [4.6, 0, 5.2], tint: 0xf2a14a },
  { model: gp('banner_red'), pos: [-6.2, 0, -0.8], scale: 1.2 },
  { model: gp('banner_red'), pos: [6.2, 0, -0.8], scale: 1.2 },
];

/** Grove (Peri Sisleri): two living trunks; the left half corrupted (Drust), the right pristine (Peri). */
const grove: Recipe = () => [
  { model: kn('tree_pineTallA'), pos: [-5.4, 0, -1], scale: 2, tint: 0x5a4452, collide: true, radius: 1 },
  { model: kn('tree_pineTallA'), pos: [5.4, 0, -1], scale: 2, tint: 0x6ea880, collide: true, radius: 1 },
  { model: kn('tree_pineGroundA'), pos: [-7.6, 0, 3], tint: 0x5a4452 },
  { model: hw('post_skull'), pos: [-4, 0, 2] },
  { model: hw('post_skull'), pos: [-5.4, 0, 5] },
  { model: gp('bone_pile'), pos: [-3.2, 0, 4.4] },
  { model: gp('brazier'), pos: [-2.4, 0, 7], tint: 0xb070ff, light: { color: 0xb070ff, intensity: 1.4, distance: 9 } },
  { model: kn('mushroom_redGroup'), pos: [3, 0, 2], scale: 6, emissive: 0xff4040, emissiveIntensity: 0.5 },
  { model: kn('mushroom_redGroup'), pos: [5, 0, 5], scale: 6, emissive: 0xff4040, emissiveIntensity: 0.5 },
  { model: kn('stone_tallB'), pos: [-3.5, 0, 4.5], scale: 1.2, emissive: 0x60ffd8, emissiveIntensity: 0.6 },
  { model: kn('stone_tallB'), pos: [3.5, 0, 4.5], scale: 1.2, emissive: 0x60ffd8, emissiveIntensity: 0.6 },
  { model: gp('statue_hooded'), pos: [6, 0, 4], tint: 0x8aa090, scale: 1.1 },
  { model: gp('lamp_post'), pos: [3, 0, 7], tint: 0x60ffd8, light: { color: 0x60ffd8, intensity: 1.2, distance: 8 } },
];

/** Web gate (Yankı Ağı): chitin-grey arch, hanging silk, teal eye-sigil light, a lost caravan wagon. */
const web: Recipe = () => [
  { model: kc('gate'), pos: [0, 0, 0], scale: 2.4, tint: 0x3a4a48, light: { color: 0x39d0c4, intensity: 2.2, distance: 14, y: 3 } },
  { model: gp('chains_hanging'), pos: [-4, 4, 0], tint: 0x39d0c4 },
  { model: gp('chains_hanging'), pos: [4, 4, 0], tint: 0x39d0c4 },
  { model: gp('crystal_blue'), pos: [-7, 0, -3], scale: 1.5, tint: 0x39d0c4, emissive: 0x39d0c4, emissiveIntensity: 0.8 },
  { model: gp('crystal_blue'), pos: [7, 0, -3], scale: 1.5, tint: 0x39d0c4, emissive: 0x39d0c4, emissiveIntensity: 0.8 },
  { model: gp('wagon'), pos: [7.4, 0, 5], rot: 20, collide: true, radius: 1.8 },
  { model: gp('bone_pile'), pos: [5.8, 0, 3] },
  { model: gp('lamp_post'), pos: [-6, 0, 6], tint: 0xffb040, light: { color: 0xffb040, intensity: 1.2, distance: 8 } },
  { model: gp('lamp_post'), pos: [6, 0, 9], tint: 0xffb040, light: { color: 0xffb040, intensity: 1.2, distance: 8 } },
  { model: gp('signpost'), pos: [-8, 0, 9], rot: -20 },
];

/** Valor stair (Yiğitler Sarayı): gold-trimmed titan arch at the top of a switchback stair, blue-white braziers and banners. */
const valor: Recipe = () => [
  { model: kc('gate'), pos: [0, 0, 0], scale: 3, tint: 0xe8d8a0 },
  { model: kg('pillar-obelisk'), pos: [-5.5, 0, -0.5], scale: 2.2, tint: 0xe8d8a0, collide: true, radius: 1.2, light: { color: 0x80b0ff, intensity: 1.6, distance: 10, y: 6 } },
  { model: kg('pillar-obelisk'), pos: [5.5, 0, -0.5], scale: 2.2, tint: 0xe8d8a0, collide: true, radius: 1.2, light: { color: 0x80b0ff, intensity: 1.6, distance: 10, y: 6 } },
  { model: dg('banner_patternC_blue'), pos: [-4, 6, -1], scale: 1.5 },
  { model: dg('banner_patternC_blue'), pos: [4, 6, -1], scale: 1.5 },
  { model: kf('stairs-wide-stone'), pos: [0, 0, 6], scale: 1.6 },
  { model: kf('stairs-wide-stone'), pos: [0, 0, 9], scale: 1.6 },
  { model: kf('stairs-wide-stone'), pos: [0, 0, 12], scale: 1.6 },
  { model: gp('statue_hooded'), pos: [-7, 0, 4], tint: 0xf0f0ff, scale: 1.2 },
  { model: gp('statue_hooded'), pos: [7, 0, 4], tint: 0xf0f0ff, scale: 1.2 },
  { model: kg('fire-basket'), pos: [-4, 0, 7], scale: 3, emissive: 0x80b0ff, emissiveIntensity: 0.8, light: { color: 0x80b0ff, intensity: 2, distance: 10 } },
  { model: kg('fire-basket'), pos: [4, 0, 7], scale: 3, emissive: 0x80b0ff, emissiveIntensity: 0.8, light: { color: 0x80b0ff, intensity: 2, distance: 10 } },
  { model: kc('flag-banner-long'), pos: [-8, 0, -3], scale: 1.4 },
  { model: kc('flag-banner-long'), pos: [8, 0, -3], scale: 1.4 },
  { model: gp('lobby_obelisk'), pos: [0, 0, 11], tint: 0xe8c060 },
];

/** Every look of `EntranceDef.look` has exactly one recipe (the Record type makes a missing one a compile error). */
export const ENTRANCE_RECIPES: Record<EntranceDef['look'], Recipe> = {
  crypt,
  forge,
  cave,
  ice,
  temple,
  temple_large,
  palace,
  arcane,
  grove,
  web,
  valor,
};

/** A season entrance before its endgame zone exists: positions are placeholders and nothing is wired into a map. */
export interface SeasonEntranceDef extends EntranceDef {
  pending: true;
}

const pending = (
  id: string, name: string, dungeonId: string, minLevel: number, regionId: string, look: EntranceDef['look'],
  facing: number, pos: [number, number] = [0, 0],
): SeasonEntranceDef => ({ id, name, dungeonId, pos, facing, minLevel, regionId, look, pending: true });

/**
 * Season pool entrances (docs/dungeons/*.md section 7). The `pos` values are placeholders until the Kadim Diyar and Karakır
 * layouts fix tiles; `regionId` names the sub-region the section 7 text proposes, which does not exist yet.
 * Look notes: Kefaret asks for `cathedral`, which is not in the union, so it uses `temple_large`; Taşkasa asks for a
 * `vault` branch of `forge` (SP-18) and uses the plain `forge` recipe until that exists.
 */
export const SEASON_ENTRANCES: SeasonEntranceDef[] = [
  pending('ent_buyucu_terasi', 'Büyücüler Terası', 'buyucu_terasi', 60, 'kd_yildizburnu', 'arcane', 90),
  pending('ent_kefaret_salonlari', 'Kefaret Salonları Girişi', 'kefaret_salonlari', 60, 'kd_kefaret_tepesi', 'temple_large', 0),
  pending('ent_les_uyanisi', 'Leş Uyanışı Girişi', 'les_uyanisi', 50, 'kd_r1', 'temple', 0),
  pending('ent_peri_sisleri', 'Peri Sisleri Girişi', 'peri_sisleri', 60, 'kd_gumus_orman', 'grove', 90, [34, 30]),
  pending('ent_taskasa', 'Taşkasa Kapısı', 'taskasa', 56, 'kd_kor_yarigi', 'forge', 180),
  pending('ent_yanki_agi', 'Yankı Ağı Girişi', 'yanki_agi', 60, 'karakir_bozkiri', 'web', 0, [69, 162]),
  pending('ent_yigitler_sarayi', 'Yiğitler Sarayı Girişi', 'yigitler_sarayi', 60, 'kd_firtina_zirveleri', 'valor', 180),
  pending('ent_yildiz_divani', 'Yıldız Kapısı', 'yildiz_divani', 55, 'kd_r3', 'palace', 180, [148, 34]),
];
