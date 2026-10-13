import type { TownNpc, TownNpcRole, TownProp, VillageDef } from '../../types/dungeons';
import { gp, ks, tw, ip, hw } from '../dungeons/kit';
import { questIdsFor } from './quests';
import { WAYPOINTS } from './karakir_world';

/**
 * KARAKIR BOZKIRI outposts (GDD_OPENWORLD section 1.8 / 2): Karakır Karakolu (walled fort at the entry, every service) and Kervansaray
 * (caravan stop in the middle, compact hub) and Kül Ocağı (ash outpost in r11, the third one). OWNER: content module. Same VillageDef schema as data/world/villages.ts: metres relative to
 * the village centre (+x east, +z south); the world builder raises the palisade from `bounds` + `gates`; NPC positions reuse the proven
 * layout of Kızılkaya Karakolu (no NPC inside a building).
 *
 * Services: quest givers (Binbaşı Tuğrul, Avcı Börte, Çoban Kerem / Kervan Başı Cengiz, Gözcü Alp), vendors (merchant, weapons,
 * armour, alchemist, Kalıntı Tüccarı), blacksmith, stash, innkeepers (Hancı Aybala / Handar Gülizar: dialog NPCs, the stone next to
 * the inn is the bind point `world.respawn`), Işınlayıcı (flight / travel panel), the waypoint stone, guards and patrols.
 */

const yb = (n: string): string => tw(`buildings/yellow/building_${n}_yellow`);

const bld = (model: string, x: number, z: number, rot: number, scale = 6): TownProp => ({ model, pos: [x, 0, z], rot, scale, collide: true });
const prop = (model: string, x: number, z: number, rot = 0, extra: Partial<TownProp> = {}): TownProp => ({ model, pos: [x, 0, z], rot, scale: 1, ...extra });

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

const FLAME = { color: 0xffb060, intensity: 1.4, distance: 9, flicker: true, y: 2.6 };

// ---------------------------------------------------------------------------------------------------------------------
// Karakır Karakolu (r7, west): fort 60 x 48 m, gates west (the road from Kuzgunkale), east (road to Kervansaray) and south
// ---------------------------------------------------------------------------------------------------------------------

const KARAKOL_PROPS: TownProp[] = [
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
  prop(gp('waypoint_stone'), 4, 10, 0, { id: 'wp_karakir_karakol' }),
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

const KARAKOL_NPCS: TownNpc[] = [
  mkNpc('npc_kk_komutan', 'Binbaşı Tuğrul', 'quest', 'Knight', 0, -7.5, 0, {
    title: 'Karakol Komutanı', show: ['2H_Sword'], tint: 0xc0a060,
    lines: ['Bozkır sessiz görünür, ama gözü açık olanın hayatta kaldığı yerdir.', 'Doğu Kapısı\'ndan gelenler iş arıyor, iş de bol.'],
  }),
  mkNpc('npc_kk_avci', 'Avcı Börte', 'quest', 'Rogue', -14, 19, 0, {
    title: 'Avcı', show: ['1H_Crossbow'], tint: 0xb89860, lines: ['Kurdun izini sürmesini bilmeyen bozkırda kalmaz.', 'Alaca Yele\'yi gördüysen bana haber ver.'],
  }),
  mkNpc('npc_kk_coban', 'Çoban Kerem', 'quest', 'Barbarian', -24, -8.5, 90, {
    title: 'Çoban', show: [], tint: 0xa88c60, lines: ['Sürü huzursuz. Kurtlar yine yakında.', 'Postlar kışlık için lazım, ellerin boş dönme.'],
  }),
  mkNpc('npc_kk_demirci', 'Demirci Temir', 'blacksmith', 'Barbarian', -14.5, -4, 90, {
    title: 'Demirci', show: ['1H_Axe'], tint: 0xb08060, ui: { panel: 'blacksmith' },
    lines: ['Rüzgâr demiri keskinleştirir, ben de ustalığı.', 'Silahın kör mü? Getir, ışıldasın.'],
  }),
  mkNpc('npc_kk_bakkal', 'Bakkal Zeynep', 'merchant', 'Rogue_Hooded', -14, 11, 90, {
    title: 'Tüccar', show: ['Rogue_Cape'], tint: 0x406080, ui: { panel: 'vendor', kind: 'merchant' }, lines: ['Yolluk, iksir, erzak; bozkırın üç şartı.'],
  }),
  mkNpc('npc_kk_silahci', 'Silahçı Oğuz', 'merchant', 'Barbarian', 11.5, -4, -90, {
    title: 'Silahçı', show: ['1H_Axe'], tint: 0x806040, ui: { panel: 'vendor', kind: 'weaponsmith' }, lines: ['Her bozkır çocuğunun bir kılıcı olur.'],
  }),
  mkNpc('npc_kk_zirhci', 'Zırhçı Gül', 'merchant', 'Knight', 11.5, 4, -90, {
    title: 'Zırhçı', show: [], ui: { panel: 'vendor', kind: 'armorsmith' }, lines: ['Rüzgâra karşı zırh, ateşe karşı da zırh.'],
  }),
  mkNpc('npc_kk_eczaci', 'Eczacı Sevim', 'alchemist', 'Mage', -10, -9, 0, {
    title: 'Simyacı', show: ['1H_Wand'], tint: 0x40a060, ui: { panel: 'vendor', kind: 'alchemist' }, lines: ['Çorak otlar bile şifa verir, nerede toplanacağını bilirsen.'],
  }),
  mkNpc('npc_kk_depocu', 'Depocu Nuri', 'stash', 'Barbarian', -17, -12, 90, {
    title: 'Depocu', show: ['Mug'], ui: { panel: 'stash' }, lines: ['Eşyaların güvende. Rüzgâr bile açamaz.'],
  }),
  mkNpc('npc_kk_isinlayici', 'Işınlayıcı Tonguç', 'teleporter', 'Mage', 4, 6.5, 0, {
    title: 'Işınlayıcı', show: ['Spellbook_open'], ui: { panel: 'waypoints' }, lines: ['Taşlara dokunduysan yol benden. Ücret ayrı.'],
  }),
  mkNpc('npc_kk_kalinti', 'Kalıntı Tüccarı Rüstem', 'merchant', 'Rogue_Hooded', -11.5, 4, 90, {
    title: 'Kalıntı Tüccarı', show: [], tint: 0x30203a, ui: { panel: 'vendor', kind: 'metin' }, lines: ['Metin kalıntısı mı? Hepsini alırım.'],
  }),
  mkNpc('npc_kk_hanci', 'Hancı Aybala', 'citizen', 'Barbarian', 14.5, -4, -90, {
    title: 'Hancı', show: ['Mug'], tint: 0xc0a078, ui: { panel: 'dialog' },
    lines: ['Hoş geldin yolcu. Han ateşi yanıyor; Karakol Taşı\'na dokunursan dinlenirken burada doğarsın.', 'Bozkırda kayıp kervanlar konuşuluyor. Dinle, anlatayım.'],
  }),
  mkNpc('npc_kk_muhafiz_1', 'Karakol Muhafızı', 'guard', 'Knight', -27, -6, 90, { show: ['1H_Sword', 'Badge_Shield'], tint: 0xa04040, lines: ['Batı kapısı benim sorumluluğumda.'] }),
  mkNpc('npc_kk_muhafiz_2', 'Karakol Muhafızı', 'guard', 'Knight', -27, 6, 90, { show: ['1H_Sword', 'Badge_Shield'], tint: 0xa04040, lines: ['Doğu yolundan gelenler hoş geldi.'] }),
  mkNpc('npc_kk_muhafiz_3', 'Karakol Muhafızı', 'guard', 'Knight', 27, -6, -90, { show: ['1H_Sword', 'Badge_Shield'], tint: 0xa04040, lines: ['Kervansaray yolu açık. Dikkatli ol.'] }),
  mkNpc('npc_kk_muhafiz_4', 'Karakol Muhafızı', 'guard', 'Knight', 27, 6, -90, { show: ['1H_Sword', 'Badge_Shield'], tint: 0xa04040, lines: ['Orklar yakında.'] }),
  mkNpc('npc_kk_devriye_1', 'Surlu Devriye', 'guard', 'Knight', -22, -18, 0, {
    show: ['1H_Sword', 'Badge_Shield'], tint: 0xa04040, route: { path: [[-22, -18], [22, -18], [22, 18], [-22, 18]], lap: 100 },
  }),
  mkNpc('npc_kk_devriye_2', 'Surlu Devriye', 'guard', 'Knight', 22, 18, 0, {
    show: ['1H_Sword', 'Badge_Shield'], tint: 0xa04040, route: { path: [[22, 18], [-22, 18], [-22, -18], [22, -18]], lap: 100 },
  }),
];

// ---------------------------------------------------------------------------------------------------------------------
// Kervansaray (r8, south-centre of the map): caravan camp 36 x 28 m
// ---------------------------------------------------------------------------------------------------------------------

const KERVAN_PROPS: TownProp[] = [
  prop(ks('tent'), 0, -8, 0, { scale: 3 }),
  prop(gp('tent'), -10, -5, 90),
  prop(gp('tent'), 10, -5, -90),
  prop(gp('wagon'), -12, 6, 30, { collide: true }),
  prop(gp('wagon'), 12, 7, -30, { collide: true }),
  prop(gp('campfire'), 0, 2, 0, { light: { color: 0xffa050, intensity: 1.6, distance: 10, flicker: true, y: 0.9 } }),
  prop(gp('market_stall'), -7, 6, 90),
  prop(gp('notice_board'), 4, -3, 0),
  prop(gp('waypoint_stone'), 4, 6, 0, { id: 'wp_karakir_kervansaray' }),
  prop(gp('banner_red'), -16, -11, 0, { scale: 1.3 }),
  prop(gp('banner_red'), 16, -11, 0, { scale: 1.3 }),
  prop(gp('barrel'), -14, -9),
  prop(gp('crate_a'), 14, -9),
  prop(gp('sacks'), -4, 9),
  prop(gp('lamp_post'), -6, -2, 0, { light: FLAME }),
  prop(gp('lamp_post'), 8, 3, 0, { light: FLAME }),
];

const KERVAN_NPCS: TownNpc[] = [
  mkNpc('npc_kv_basi', 'Kervan Başı Cengiz', 'quest', 'Barbarian', 0, -5.5, 0, {
    title: 'Kervan Başı', show: [], tint: 0xb89860, lines: ['Kervan yolu açık kalırsa herkes kazanır.', 'Ayaz Geçidi\'ne giden kervanlar artık dönmüyor.'],
  }),
  mkNpc('npc_kv_gozcu', 'Gözcü Alp', 'quest', 'Rogue', 8, -1.5, -90, {
    title: 'Gözcü', show: ['1H_Crossbow'], tint: 0x6a5a40, lines: ['Çukurlardan, kayalardan, buzullardan göz kırpmadan izliyorum.'],
  }),
  mkNpc('npc_kv_hanci', 'Handar Gülizar', 'citizen', 'Barbarian', -8, -1.5, 90, {
    title: 'Handar', show: ['Mug'], tint: 0xc0a078, ui: { panel: 'dialog' },
    lines: ['Ateşin yanına otur. Kervansaray Taşı\'na dokunursan buradan doğarsın.', 'Kızıl Çorak\'tan dönenler hep aynı hikâyeyi anlatıyor.'],
  }),
  mkNpc('npc_kv_tuccar', 'Kervancı Selçuk', 'merchant', 'Rogue_Hooded', -5, 4.5, 90, {
    title: 'Tüccar', show: ['Rogue_Cape'], tint: 0x90b4d4, ui: { panel: 'vendor', kind: 'merchant' }, lines: ['Kervandan taze mal, kervandan taze haber.'],
  }),
  mkNpc('npc_kv_isinlayici', 'Işınlayıcı Dilek', 'teleporter', 'Mage', 0.5, 7, 0, {
    title: 'Işınlayıcı', show: ['Spellbook_open'], tint: 0xa888c8, ui: { panel: 'waypoints' }, lines: ['Hangi taşı keşfettiysen, orada olursun.'],
  }),
  mkNpc('npc_kv_muhafiz_1', 'Kervan Muhafızı', 'guard', 'Knight', -17, 0, 90, { show: ['1H_Sword', 'Badge_Shield'], tint: 0x806040, lines: ['Kervansaray güvende.'] }),
  mkNpc('npc_kv_muhafiz_2', 'Kervan Muhafızı', 'guard', 'Knight', 17, 0, -90, { show: ['1H_Sword', 'Badge_Shield'], tint: 0x806040, lines: ['Doğu yolundan dikkat.'] }),
];

// ---------------------------------------------------------------------------------------------------------------------

// ---------------------------------------------------------------------------------------------------------------------
// Kül Ocağı (r11, south-east of the Kül Ovası): ash camp 48 x 36 m, the third outpost; the road from the Kervansaray ends at its west gate
// ---------------------------------------------------------------------------------------------------------------------

const KUL_PROPS: TownProp[] = [
  prop(ks('tent'), 0, -8, 0, { scale: 3 }),
  prop(gp('tent'), -10, -5, 90),
  prop(gp('tent'), 10, -5, -90),
  prop(gp('wagon'), -12, 6, 30, { collide: true }),
  prop(gp('wagon'), 12, 7, -30, { collide: true }),
  prop(gp('campfire'), 0, 2, 0, { light: { color: 0xffa050, intensity: 1.6, distance: 10, flicker: true, y: 0.9 } }),
  prop(gp('market_stall'), -7, 6, 90),
  prop(gp('notice_board'), 4, -3, 0),
  prop(gp('waypoint_stone'), 4, 6, 0, { id: 'wp_karakir_kul_ocagi' }),
  prop(gp('banner_red'), -16, -11, 0, { scale: 1.3 }),
  prop(gp('banner_red'), 16, -11, 0, { scale: 1.3 }),
  prop(gp('barrel'), -14, -9),
  prop(gp('crate_a'), 14, -9),
  prop(gp('sacks'), -4, 9),
  prop(gp('bone_pile'), 14, 8),
  prop(gp('lamp_post'), -6, -2, 0, { light: FLAME }),
  prop(gp('lamp_post'), 8, 3, 0, { light: FLAME }),
];

const KUL_NPCS: TownNpc[] = [
  mkNpc('npc_ko_nobetci', 'Nöbetçi Yusuf', 'quest', 'Knight', 0, -5.5, 0, {
    title: 'Kül Ocağı Nöbetçisi', show: ['1H_Sword'], tint: 0x9a9488,
    lines: ['Kül Ovası\'nda rüzgâr tozu kaldırır; gözünü açık tut.', 'Kül Efendisi\'nin adını duyan geceleri uyuyamaz.'],
  }),
  mkNpc('npc_ko_kasif', 'Kâşif Aslı', 'quest', 'Rogue', 8, -1.5, -90, {
    title: 'Kâşif', show: ['1H_Crossbow'], tint: 0x7a8090, lines: ['Sırttaki kartal yuvalarına çıkmak isteyen var mı? Önce benimle konuş.'],
  }),
  mkNpc('npc_ko_hanci', 'Handar Nazlı', 'citizen', 'Barbarian', -8, -1.5, 90, {
    title: 'Handar', show: ['Mug'], tint: 0xc0a078, ui: { panel: 'dialog' },
    lines: ['Ateşin yanına otur. Kül Ocağı Taşı\'na dokunursan buradan doğarsın.', 'Kül Ovası\'nda geceleri hortlaklar yürür, dikkat et.'],
  }),
  mkNpc('npc_ko_tuccar', 'Kervancı Halil', 'merchant', 'Rogue_Hooded', -5, 4.5, 90, {
    title: 'Tüccar', show: ['Rogue_Cape'], tint: 0x90a4b4, ui: { panel: 'vendor', kind: 'merchant' }, lines: ['Kül Ovası\'nın iksirleri pahalı, ama işe yarar.'],
  }),
  mkNpc('npc_ko_isinlayici', 'Işınlayıcı Ferhat', 'teleporter', 'Mage', 0.5, 7, 0, {
    title: 'Işınlayıcı', show: ['Spellbook_open'], tint: 0x8898b8, ui: { panel: 'waypoints' }, lines: ['Taşları gördüğün yerden bana dön, yolun açılır.'],
  }),
  mkNpc('npc_ko_muhafiz_1', 'Kül Ocağı Muhafızı', 'guard', 'Knight', -17, 0, 90, { show: ['1H_Sword', 'Badge_Shield'], tint: 0x706058, lines: ['Batı kapısı kapalı kalmaz, ama bizim izin gerekir.'] }),
  mkNpc('npc_ko_muhafiz_2', 'Kül Ocağı Muhafızı', 'guard', 'Knight', 17, 0, -90, { show: ['1H_Sword', 'Badge_Shield'], tint: 0x706058, lines: ['Kartal Sırtı\'na giden yol yukarıda.'] }),
];

const waypointOf = (id: string): string | undefined => WAYPOINTS.find((w) => w.id === id)?.id;

export const VILLAGES: VillageDef[] = [
  {
    id: 'koy_karakir_karakolu',
    name: 'Karakır Karakolu',
    center: [45, 159],
    bounds: [30, 24],
    // respawn point = the Karakol Taşı: wp (46, 161.5) - centre (45, 159) = (4, 10) m
    spawn: { pos: [4, 10], facing: 0 },
    props: KARAKOL_PROPS,
    npcs: KARAKOL_NPCS,
    gates: [
      { id: 'bati', pos: [-30, 0], rot: 90, width: 8 },
      { id: 'dogu', pos: [30, 0], rot: 90, width: 8 },
      { id: 'guney', pos: [0, 24], rot: 0, width: 8 },
    ],
    waypointId: waypointOf('wp_karakir_karakol'),
  },
  {
    id: 'kamp_kervansaray',
    name: 'Kervansaray',
    center: [174, 192],
    bounds: [20, 14],
    // wp (175, 193.5) - centre (174, 192) = (4, 6) m; the stone prop stands on it
    spawn: { pos: [4, 6], facing: 0 },
    props: KERVAN_PROPS,
    npcs: KERVAN_NPCS,
    gates: [
      { id: 'bati', pos: [-20, 0], rot: 90, width: 8 },
      { id: 'dogu', pos: [20, 0], rot: 90, width: 8 },
      { id: 'kuzey', pos: [0, -14], rot: 0, width: 8 },
      { id: 'guney', pos: [0, 14], rot: 0, width: 8 },
    ],
    waypointId: waypointOf('wp_karakir_kervansaray'),
  },
  {
    id: 'koy_kul_ocagi',
    name: 'Kül Ocağı',
    center: [348, 210],
    bounds: [24, 18],
    // wp (349, 211.5) - centre (348, 210) = (4, 6) m; the stone prop stands on it
    spawn: { pos: [4, 6], facing: 0 },
    props: KUL_PROPS,
    npcs: KUL_NPCS,
    gates: [
      { id: 'bati', pos: [-24, 0], rot: 90, width: 8 },
      { id: 'dogu', pos: [24, 0], rot: 90, width: 8 },
      { id: 'kuzey', pos: [0, -18], rot: 0, width: 8 },
      { id: 'guney', pos: [0, 18], rot: 0, width: 8 },
    ],
    waypointId: waypointOf('wp_karakir_kul_ocagi'),
  },
];
