import type { TownNpc, TownNpcRole, TownProp, VillageDef } from '../../types/dungeons';
import { gp, ks, tw, ip, hw } from '../dungeons/kit';
import { questIdsFor } from './quests';

/**
 * AYAZ DAĞLARI outposts (levels 45-60, regions r16..r21). OWNER: content module. Same VillageDef schema as karakir_villages.ts; the lead
 * imports AYAZ_VILLAGES into the zone's world (ayaz_daglari.ts).
 *
 *   Ayaz Geçidi Karakolu (koy_ayaz_gecidi, r16, tile centre (30, 200)): walled fort at the pass, the zone's entry (the Karakır
 *       road from Kartal Sırtı ends here). Givers Komutan Turan and İzci Sarp (npc_ad_gecit_*).
 *   Kırağı Konağı (kamp_kiragi_konagi, r18, tile centre (190, 110)): fortified mansion of the frost valley and the lake. Givers
 *       Konak Ağası Mirza and Kâşif Kaya (npc_ad_kiragi_*).
 *   Buz Kulesi Gözlemevi (koy_buz_kulesi, r20, tile centre (320, 230)): observatory tower at the foot of the summit. Givers
 *       Gözlemci Ferit and Kahin Nilay (npc_ad_buz_*).
 *
 * Metres relative to the village centre (+x east, +z south); the world builder raises the palisade from `bounds` + `gates`. Every
 * outpost has the same service set as the Karakır ones: quest givers, a merchant (vendor), a blacksmith (Gecit only), an innkeeper
 * (dialog), a teleporter (waypoint panel), guards, and the waypoint stone which is the bind point (`spawn`).
 * Waypoint stones (for the lead's WAYPOINTS): wp_ayaz_gecit_karakol at centre + (1, 2.5) tiles, wp_ayaz_kiragi_1 at centre + (1, 1.5),
 * wp_ayaz_buz_kulesi at centre + (1, 1.5).
 */

const bld = (model: string, x: number, z: number, rot: number, scale = 6): TownProp => ({ model, pos: [x, 0, z], rot, scale, collide: true });
const prop = (model: string, x: number, z: number, rot = 0, extra: Partial<TownProp> = {}): TownProp => ({ model, pos: [x, 0, z], rot, scale: 1, ...extra });
const yb = (n: string): string => tw(`buildings/yellow/building_${n}_yellow`);

interface NpcOpts extends Partial<TownNpc> {
  route?: { path: [number, number][]; lap: number };
}
const mkNpc = (id: string, name: string, role: TownNpcRole, model: string, x: number, z: number, rot: number, o: NpcOpts = {}): TownNpc => {
  const { route, ...rest } = o;
  const n: TownNpc = { id, name, role, model, pos: [x, 0, z], rot, idle: 'Idle', ...rest };
  const quests = questIdsFor(id);
  if (quests.length) n.quests = quests;
  if (route) n.patrol = route;
  return n;
};

const FLAME = { color: 0xa8d8ff, intensity: 1.3, distance: 9, flicker: true, y: 2.6 };
const CAMP_FLAME = { color: 0xb8e0ff, intensity: 1.5, distance: 10, flicker: true, y: 0.9 };

// ---------------------------------------------------------------------------------------------------------------------
// Ayaz Geçidi Karakolu (r16, the pass): fort 60 x 48 m, gates west (the road from Kartal Sırtı), east (the pass road) and south
// ---------------------------------------------------------------------------------------------------------------------

const GECIT_PROPS: TownProp[] = [
  bld(yb('castle'), 0, -15, 0, 5),
  bld(yb('tavern'), 20, -4, -90),
  bld(yb('blacksmith'), -20, -4, 90),
  bld(yb('market'), -20, 11, 90),
  bld(yb('barracks'), 21, 11, -90),
  bld(yb('archeryrange'), -4, 14, 0),
  bld(yb('home_A'), -24, -15, 90),
  bld(yb('home_B'), 24, -15, -90),
  prop(gp('market_stall'), 9, 4, -90),
  prop(gp('market_stall'), 9, -4, -90),
  prop(gp('market_stall'), -9, 4, 90),
  prop(gp('tent'), -10, -14, 0),
  { model: ip('nocturnal-watch', 'well'), pos: [0, 0, 0], rot: 0, scale: 1, collide: true },
  prop(gp('waypoint_stone'), 4, 10, 0, { id: 'wp_ayaz_gecit_karakol' }),
  prop(gp('notice_board'), 0, -5, 0),
  // gates: arches and corner towers
  prop(hw('arch'), -30, 0, 90, { scale: 1.9 }),
  prop(hw('arch'), 30, 0, 90, { scale: 1.9 }),
  prop(hw('arch'), 0, 24, 0, { scale: 1.9 }),
  bld(tw('buildings/yellow/building_tower_B_yellow'), -26, -20, 0, 6),
  bld(tw('buildings/yellow/building_tower_B_yellow'), 26, -20, 0, 6),
  bld(tw('buildings/yellow/building_tower_B_yellow'), -26, 20, 0, 6),
  bld(tw('buildings/yellow/building_tower_B_yellow'), 26, 20, 0, 6),
  prop(gp('lamp_post'), -5, -9, 0, { light: FLAME }),
  prop(gp('lamp_post'), 5, -9, 0, { light: FLAME }),
  prop(gp('lamp_post'), -5, 8, 0, { light: FLAME }),
  prop(gp('lamp_post'), 14, 3, 0, { light: FLAME }),
  prop(gp('wagon'), 24, 18, 0, { collide: true }),
  prop(gp('wagon'), -26, 22, 0),
  prop(gp('banner_red'), -29, -8, 90, { scale: 1.3 }),
  prop(gp('banner_red'), -29, 8, 90, { scale: 1.3 }),
  prop(gp('barrel'), 16, -9),
  prop(gp('crate_a'), 17, 4.5),
];

const GECIT_NPCS: TownNpc[] = [
  mkNpc('npc_ad_gecit_komutan', 'Geçit Komutanı Turan', 'quest', 'Knight', 0, -7.5, 0, {
    title: 'Geçit Komutanı', show: ['2H_Sword'], tint: 0x9ab0c8,
    lines: ['Buz Geçidi\'nde nefes bile donar. Dikkatli ol.', 'Kızıl Çorak\'tan gelen kervanlar bize kadar geldi; buradan ileriye geçen yok.'],
  }),
  mkNpc('npc_ad_gecit_izci', 'İzci Sarp', 'quest', 'Rogue', -14, 19, 0, {
    title: 'İzci', show: ['1H_Crossbow'], tint: 0x8aa0b8, lines: ['Yamaçtaki her izi okurum; kurdun ne zaman yaklaştığını bilirim.', 'Altın damarını gördüysen bana haber ver.'],
  }),
  mkNpc('npc_ad_gecit_demirci', 'Demirci Boran', 'blacksmith', 'Barbarian', -14.5, -4, 90, {
    title: 'Demirci', show: ['1H_Axe'], tint: 0x9098a8, ui: { panel: 'blacksmith' },
    lines: ['Soğukta çelik çatlar; ben onu sıcak tutmasını bilirim.', 'Silahın donmuş mu? Getir, çözeyim.'],
  }),
  mkNpc('npc_ad_gecit_tuccar', 'Tüccar Kadir', 'merchant', 'Rogue_Hooded', -14, 11, 90, {
    title: 'Tüccar', show: ['Rogue_Cape'], tint: 0x6080a0, ui: { panel: 'vendor', kind: 'merchant' }, lines: ['Kürk, iksir, erzak. Geçidin fiyatı biraz yüksek, ama işe yarar.'],
  }),
  mkNpc('npc_ad_gecit_isinlayici', 'Işınlayıcı Ruhi', 'teleporter', 'Mage', 4, 6.5, 0, {
    title: 'Işınlayıcı', show: ['Spellbook_open'], ui: { panel: 'waypoints' }, lines: ['Taşlara dokunduysan yol benden geçer. Ücret ayrı.'],
  }),
  mkNpc('npc_ad_gecit_hanci', 'Handar Nevin', 'citizen', 'Barbarian', 14.5, -4, -90, {
    title: 'Hancı', show: ['Mug'], tint: 0xb8c4d0, ui: { panel: 'dialog' },
    lines: ['Hoş geldin yolcu. Ocak yanıyor; Karakol Taşı\'na dokunursan dinlenirken burada doğarsın.', 'Geçitten dönenler hep aynı şeyi anlatıyor: kar, kurt ve sessizlik.'],
  }),
  mkNpc('npc_ad_gecit_muhafiz_1', 'Geçit Muhafızı', 'guard', 'Knight', -27, -6, 90, { show: ['1H_Sword', 'Badge_Shield'], tint: 0x5a6e88, lines: ['Batı kapısı benim nöbetimde.'] }),
  mkNpc('npc_ad_gecit_muhafiz_2', 'Geçit Muhafızı', 'guard', 'Knight', -27, 6, 90, { show: ['1H_Sword', 'Badge_Shield'], tint: 0x5a6e88, lines: ['Geçit yolundan gelenler hoş geldi.'] }),
  mkNpc('npc_ad_gecit_muhafiz_3', 'Geçit Muhafızı', 'guard', 'Knight', 27, -6, -90, { show: ['1H_Sword', 'Badge_Shield'], tint: 0x5a6e88, lines: ['Doğu yolu açık. Dağın öte yüzü soğuk.'] }),
  mkNpc('npc_ad_gecit_muhafiz_4', 'Geçit Muhafızı', 'guard', 'Knight', 27, 6, -90, { show: ['1H_Sword', 'Badge_Shield'], tint: 0x5a6e88, lines: ['Kurtlar yakında, dikkat et.'] }),
  mkNpc('npc_ad_gecit_devriye_1', 'Surlu Devriye', 'guard', 'Knight', -22, -18, 0, {
    show: ['1H_Sword', 'Badge_Shield'], tint: 0x5a6e88, route: { path: [[-22, -18], [22, -18], [22, 18], [-22, 18]], lap: 100 },
  }),
  mkNpc('npc_ad_gecit_devriye_2', 'Surlu Devriye', 'guard', 'Knight', 22, 18, 0, {
    show: ['1H_Sword', 'Badge_Shield'], tint: 0x5a6e88, route: { path: [[22, 18], [-22, 18], [-22, -18], [22, -18]], lap: 100 },
  }),
];

// ---------------------------------------------------------------------------------------------------------------------
// Kırağı Konağı (r18, the frost valley and the lake): ash-camp layout, 48 x 36 m, the konak of the lake; gates on all four sides
// ---------------------------------------------------------------------------------------------------------------------

const KIRAGI_PROPS: TownProp[] = [
  prop(ks('tent'), 0, -8, 0, { scale: 3 }),
  prop(gp('tent'), -10, -5, 90),
  prop(gp('tent'), 10, -5, -90),
  prop(gp('wagon'), -12, 6, 30, { collide: true }),
  prop(gp('wagon'), 12, 7, -30, { collide: true }),
  prop(gp('campfire'), 0, 2, 0, { light: CAMP_FLAME }),
  prop(gp('market_stall'), -7, 6, 90),
  prop(gp('notice_board'), 4, -3, 0),
  prop(gp('waypoint_stone'), 4, 6, 0, { id: 'wp_ayaz_kiragi_1' }),
  prop(gp('banner_red'), -16, -11, 0, { scale: 1.3 }),
  prop(gp('banner_red'), 16, -11, 0, { scale: 1.3 }),
  prop(gp('barrel'), -14, -9),
  prop(gp('crate_a'), 14, -9),
  prop(gp('sacks'), -4, 9),
  prop(gp('bone_pile'), 14, 8),
  prop(gp('lamp_post'), -6, -2, 0, { light: FLAME }),
  prop(gp('lamp_post'), 8, 3, 0, { light: FLAME }),
];

const KIRAGI_NPCS: TownNpc[] = [
  mkNpc('npc_ad_kiragi_komutan', 'Konak Ağası Mirza', 'quest', 'Knight', 0, -5.5, 0, {
    title: 'Konak Ağası', show: ['1H_Sword'], tint: 0xa8b8c8,
    lines: ['Kırağı Vadisi\'nde buz ayıları aç dolaşıyor; konağın kapısını sıkı tut.', 'Yetiler dağdan indi. Göl kıyısındakiler bizden yardım bekliyor.'],
  }),
  mkNpc('npc_ad_kiragi_kasif', 'Kâşif Kaya', 'quest', 'Rogue', 8, -1.5, -90, {
    title: 'Kâşif', show: ['1H_Crossbow'], tint: 0x90a0b8, lines: ['Fırtına Sırtı\'na çıkmak isteyen var mı? Önce benimle konuş, haritam var.'],
  }),
  mkNpc('npc_ad_kiragi_hanci', 'Handar Dilber', 'citizen', 'Barbarian', -8, -1.5, 90, {
    title: 'Handar', show: ['Mug'], tint: 0xc0cad8, ui: { panel: 'dialog' },
    lines: ['Ateşin yanına otur. Kırağı Taşı\'na dokunursan buradan doğarsın.', 'Donmuş göl gece bağırıyor; kimse uyuyamıyor.'],
  }),
  mkNpc('npc_ad_kiragi_tuccar', 'Kervancı Bahri', 'merchant', 'Rogue_Hooded', -5, 4.5, 90, {
    title: 'Tüccar', show: ['Rogue_Cape'], tint: 0x8498b0, ui: { panel: 'vendor', kind: 'merchant' }, lines: ['Yaylanın iksirleri pahalı, ama soğukta hayat kurtarır.'],
  }),
  mkNpc('npc_ad_kiragi_isinlayici', 'Işınlayıcı Hasib', 'teleporter', 'Mage', 0.5, 7, 0, {
    title: 'Işınlayıcı', show: ['Spellbook_open'], tint: 0x7890b8, ui: { panel: 'waypoints' }, lines: ['Taşları gördüğün yerden bana dön, yolun açılır.'],
  }),
  mkNpc('npc_ad_kiragi_muhafiz_1', 'Konak Muhafızı', 'guard', 'Knight', -17, 0, 90, { show: ['1H_Sword', 'Badge_Shield'], tint: 0x607080, lines: ['Batı kapısı kapalı; yaylaya kimse izinsiz çıkmaz.'] }),
  mkNpc('npc_ad_kiragi_muhafiz_2', 'Konak Muhafızı', 'guard', 'Knight', 17, 0, -90, { show: ['1H_Sword', 'Badge_Shield'], tint: 0x607080, lines: ['Rüzgârlı sırt yukarıda, dikkat et.'] }),
];

// ---------------------------------------------------------------------------------------------------------------------
// Buz Kulesi Gözlemevi (r20, Zemheri Yaylası): observatory 52 x 40 m with four corner towers; gates on all four sides
// ---------------------------------------------------------------------------------------------------------------------

const BUZ_PROPS: TownProp[] = [
  prop(ks('tent'), 0, -8, 0, { scale: 3 }),
  prop(gp('tent'), -10, -5, 90),
  prop(gp('tent'), 10, -5, -90),
  prop(gp('wagon'), -12, 6, 30, { collide: true }),
  prop(gp('wagon'), 12, 7, -30, { collide: true }),
  prop(gp('campfire'), 0, 2, 0, { light: CAMP_FLAME }),
  prop(gp('market_stall'), -7, 6, 90),
  prop(gp('notice_board'), 4, -3, 0),
  prop(gp('waypoint_stone'), 4, 6, 0, { id: 'wp_ayaz_buz_kulesi' }),
  prop(gp('banner_red'), -16, -11, 0, { scale: 1.3 }),
  prop(gp('banner_red'), 16, -11, 0, { scale: 1.3 }),
  prop(gp('barrel'), -14, -9),
  prop(gp('crate_a'), 14, -9),
  prop(gp('sacks'), -4, 9),
  prop(gp('lamp_post'), -6, -2, 0, { light: FLAME }),
  prop(gp('lamp_post'), 8, 3, 0, { light: FLAME }),
  // the observatory: four corner towers, the gate arches
  bld(tw('buildings/yellow/building_tower_B_yellow'), -22, -16, 0, 5),
  bld(tw('buildings/yellow/building_tower_B_yellow'), 22, -16, 0, 5),
  bld(tw('buildings/yellow/building_tower_B_yellow'), -22, 16, 0, 5),
  bld(tw('buildings/yellow/building_tower_B_yellow'), 22, 16, 0, 5),
  prop(hw('arch'), -26, 0, 90, { scale: 1.6 }),
  prop(hw('arch'), 26, 0, 90, { scale: 1.6 }),
];

const BUZ_NPCS: TownNpc[] = [
  mkNpc('npc_ad_buz_gozlemci', 'Gözlemci Ferit', 'quest', 'Mage', 0, -5.5, 0, {
    title: 'Başgözlemci', show: ['Spellbook_open'], tint: 0xa8c8e8,
    lines: ['Kadranlar sabah üçte aynı yönü gösteriyor. Zemheri uyanıyor.', 'Yıldızlar bu yaylada yalan söylemez; soğuk da öyle.'],
  }),
  mkNpc('npc_ad_buz_kahin', 'Kahin Nilay', 'quest', 'Mage', 8, -1.5, -90, {
    title: 'Kahin', show: ['1H_Wand'], tint: 0xb8a8e0, lines: ['Donmuş Kral\'ın tacı kırıldığında mezarlık da sessizleşecek.', 'Zirve Kuşağı\'nda şövalyeler yürüyor; dikkat et.'],
  }),
  mkNpc('npc_ad_buz_hanci', 'Handar Sevim', 'citizen', 'Barbarian', -8, -1.5, 90, {
    title: 'Handar', show: ['Mug'], tint: 0xc4d0e0, ui: { panel: 'dialog' },
    lines: ['Ateşin yanına otur. Buz Taşı\'na dokunursan buradan doğarsın.', 'Gözlemevinin kulesinde gece hiç ışık sönmez.'],
  }),
  mkNpc('npc_ad_buz_tuccar', 'Simyacı Ceyda', 'merchant', 'Rogue_Hooded', -5, 4.5, 90, {
    title: 'Tüccar', show: ['Rogue_Cape'], tint: 0x90b0d0, ui: { panel: 'vendor', kind: 'merchant' }, lines: ['Yaylada şifa iksiri, zirvede can iksiri. Hangisi lazımsa.'],
  }),
  mkNpc('npc_ad_buz_isinlayici', 'Işınlayıcı Dara', 'teleporter', 'Mage', 0.5, 7, 0, {
    title: 'Işınlayıcı', show: ['Spellbook_open'], tint: 0x90a8d0, ui: { panel: 'waypoints' }, lines: ['Taşlardan birini bulduysan yol buradan açılır.'],
  }),
  mkNpc('npc_ad_buz_muhafiz_1', 'Gözlemevi Muhafızı', 'guard', 'Knight', -19, 0, 90, { show: ['1H_Sword', 'Badge_Shield'], tint: 0x6080a0, lines: ['Batı kapısı yolculara açık, ama gece kapanır.'] }),
  mkNpc('npc_ad_buz_muhafiz_2', 'Gözlemevi Muhafızı', 'guard', 'Knight', 19, 0, -90, { show: ['1H_Sword', 'Badge_Shield'], tint: 0x6080a0, lines: ['Zirveye giden yol yukarıda; orada rüzgâr bıçak gibi keser.'] }),
];

// ---------------------------------------------------------------------------------------------------------------------

export const AYAZ_VILLAGES: VillageDef[] = [
  {
    id: 'koy_ayaz_gecidi',
    name: 'Ayaz Geçidi Karakolu',
    center: [30, 200],
    bounds: [30, 24],
    // respawn point = the Geçit Taşı: centre + (4, 10) m
    spawn: { pos: [4, 10], facing: 0 },
    props: GECIT_PROPS,
    npcs: GECIT_NPCS,
    gates: [
      { id: 'bati', pos: [-30, 0], rot: 90, width: 8 },
      { id: 'dogu', pos: [30, 0], rot: 90, width: 8 },
      { id: 'guney', pos: [0, 24], rot: 0, width: 8 },
    ],
    waypointId: 'wp_ayaz_gecit_karakol',
  },
  {
    id: 'kamp_kiragi_konagi',
    name: 'Kırağı Konağı',
    center: [190, 110],
    bounds: [24, 18],
    // wp (191, 111.5) - centre (190, 110) = (4, 6) m; the stone prop stands on it
    spawn: { pos: [4, 6], facing: 0 },
    props: KIRAGI_PROPS,
    npcs: KIRAGI_NPCS,
    gates: [
      { id: 'bati', pos: [-24, 0], rot: 90, width: 8 },
      { id: 'dogu', pos: [24, 0], rot: 90, width: 8 },
      { id: 'kuzey', pos: [0, -18], rot: 0, width: 8 },
      { id: 'guney', pos: [0, 18], rot: 0, width: 8 },
    ],
    waypointId: 'wp_ayaz_kiragi_1',
  },
  {
    id: 'koy_buz_kulesi',
    name: 'Buz Kulesi Gözlemevi',
    center: [320, 230],
    bounds: [26, 20],
    // wp (321, 231.5) - centre (320, 230) = (4, 6) m; the stone prop stands on it
    spawn: { pos: [4, 6], facing: 0 },
    props: BUZ_PROPS,
    npcs: BUZ_NPCS,
    gates: [
      { id: 'bati', pos: [-26, 0], rot: 90, width: 8 },
      { id: 'dogu', pos: [26, 0], rot: 90, width: 8 },
      { id: 'kuzey', pos: [0, -20], rot: 0, width: 8 },
      { id: 'guney', pos: [0, 20], rot: 0, width: 8 },
    ],
    waypointId: 'wp_ayaz_buz_kulesi',
  },
];
