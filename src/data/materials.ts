import type { Rarity } from '../types/common';
import type { StatBlock } from '../types/stats';
import { BOHCA_DEFS } from './market';
import { PETS, petItemId } from './pets';
import { MOUNTS, MOUNT_CALL_ID, mountItemId } from './mounts';

export interface MaterialDef {
  id: string;
  name: string;      // Turkish
  desc: string;
  icon: string;
  rarity: Rarity;
  sellPrice: number;
  buyPrice?: number;
  /** 'quest': story / quest / collection items (no sale, consumed by quests or Av Defteri). */
  kind: 'currency' | 'upgrade' | 'consumable' | 'crafting' | 'key' | 'quest';
  // ---- items module extras (all optional) ----
  maxStack?: number;
  requiredLevel?: number;
  /** Gem (crafting kind): type id (ruby...) and grade 1..6. */
  gem?: { type: string; grade: number };
  /** Potion data (consumable kind). */
  potion?: { kind: 'hp' | 'mp'; tier: number; pct: number; instantFrac: number; overTime: number; cooldown: number };
  /** Elixir data: one active per category; stats are added by StatCalc while active. */
  elixir?: { category: 'war' | 'guard' | 'help'; categoryName: string; durationSec: number; stats: StatBlock; noMythic?: boolean };
  /** Town portal scroll etc. */
  scroll?: boolean;
  /** CM14 Pazar licence (Pazar Bohçası / Büyük Bohça): using it from the pouch opens the stall setup (panel `marketOpen`); the stall consumes it. */
  market?: { slots: number };
  /** WP-12: a pet teaching item (kind consumable). Using it teaches the pet once (systems/Pets.ts). */
  teachesPet?: string;
  /** Binek koleksiyonu: a mount teaching item (kind consumable). Using it teaches the mount once (systems/Mounts.ts). */
  teachesMount?: string;
}

export const MATERIALS: Record<string, MaterialDef> = {};
export const getMaterial = (id: string): MaterialDef | undefined => MATERIALS[id];

function add(def: MaterialDef): void {
  MATERIALS[def.id] = def;
}
const ic = (name: string) => `/assets/icons/${name}.svg`;

// ------------------------------------------------------------------ upgrade / crafting / currency (GDD 5.2, 5.4, 5.5)
add({ id: 'kara_demir', name: 'Kara Demir', desc: 'Demirci için +1 ile +6 arası yükseltmelerde kullanılır.', icon: ic('item-metal-bar'), rarity: 'common', sellPrice: 5, buyPrice: 20, kind: 'upgrade', maxStack: 9999 });
add({ id: 'buyulu_toz', name: 'Büyülü Toz', desc: '+4 ile +15 arası yükseltmelerde ve taş birleştirmede kullanılır.', icon: ic('item-crystal-shard'), rarity: 'uncommon', sellPrice: 20, buyPrice: 90, kind: 'upgrade', maxStack: 9999 });
add({ id: 'ejderha_pulu', name: 'Ejderha Pulu', desc: '+7 ile +15 arası yükseltmelerde kullanılır. Ejderha pullarında kadim bir güç saklıdır.', icon: ic('item-upgrade-stone'), rarity: 'rare', sellPrice: 200, kind: 'upgrade', maxStack: 9999 });
// Loot V3 §9.1: Yiğitlik Taşı, one grade per difficulty tier (the upgrade currency of systems/Track.ts). Not sold to vendors.
add({ id: 'yt_cirak', name: 'Çırak Yiğitlik Taşı', desc: 'Çırak Yolu eşyalarını yükseltir. Normal zindan patronlarından ve nadir yaratıklardan düşer.', icon: ic('item-upgrade-stone'), rarity: 'uncommon', sellPrice: 0, kind: 'currency', maxStack: 9999 });
add({ id: 'yt_usta', name: 'Usta Yiğitlik Taşı', desc: 'Usta Yolu eşyalarını yükseltir. Kahramanlık zindan patronlarından düşer.', icon: ic('item-upgrade-stone'), rarity: 'rare', sellPrice: 0, kind: 'currency', maxStack: 9999 });
add({ id: 'yt_sampiyon', name: 'Şampiyon Yiğitlik Taşı', desc: 'Şampiyon Yolu eşyalarını yükseltir. Mitik 0 ve Mitik+ (2-6) patronlarından düşer.', icon: ic('item-upgrade-stone'), rarity: 'epic', sellPrice: 0, kind: 'currency', maxStack: 9999 });
add({ id: 'yt_efsane', name: 'Efsane Yiğitlik Taşı', desc: 'Efsane Yolu eşyalarını yükseltir. Mitik+ (7 ve üstü) patronlarından ve sandıklarından düşer.', icon: ic('item-upgrade-stone'), rarity: 'legendary', sellPrice: 0, kind: 'currency', maxStack: 9999 });
add({ id: 'ruh_tasi', name: 'Ruh Taşı', desc: '+10 ile +15 arası yükseltmelerde kullanılır. Mitik+ patronlarından ve sandıklarından düşer.', icon: ic('item-crystal'), rarity: 'epic', sellPrice: 1000, kind: 'upgrade', maxStack: 9999 });
add({ id: 'kutsama_kagidi', name: 'Kutsama Kağıdı', desc: 'Yükseltme başarısız olursa eşyanın seviyesi düşmez ve eşya yok olmaz.', icon: ic('item-scroll-tied'), rarity: 'epic', sellPrice: 600, kind: 'upgrade', maxStack: 999 });
add({ id: 'demirci_el_kitabi', name: 'Demircinin El Kitabı', desc: 'Tek bir yükseltme denemesinin başarı şansını %10 artırır.', icon: ic('item-book'), rarity: 'rare', sellPrice: 250, kind: 'upgrade', maxStack: 999 });
add({ id: 'efsun_nesnesi', name: 'Efsun Nesnesi', desc: 'Eşyanın rastgele efsunlarını (tür ve değer) yeniden çevirir. Efsanevi eşyalarda yalnızca rastgele satır değişir.', icon: ic('item-efsun-orb'), rarity: 'rare', sellPrice: 1500, buyPrice: 8000, kind: 'crafting', maxStack: 999 });
add({ id: 'efsun_kilidi', name: 'Efsun Kilidi', desc: 'Efsun Nesnesi kullanmadan önce bir efsunu kilitler. 1 kilit = 1 adet, 2 kilit = 3 adet.', icon: ic('item-key'), rarity: 'rare', sellPrice: 800, kind: 'crafting', maxStack: 999 });
add({ id: 'kadim_efsun', name: 'Kadim Efsun', desc: 'Efsunların türünü korur, yalnızca değerlerini kendi kademeleri içinde yeniden çevirir.', icon: ic('item-enchant-scroll'), rarity: 'epic', sellPrice: 2500, kind: 'crafting', maxStack: 999 });
add({ id: 'takviye_nesnesi', name: 'Takviye Nesnesi', desc: 'Nadirlik sınırını aşmadan eşyaya rastgele bir efsun ekler. Normal eşyayı Büyülü yapar.', icon: ic('item-enchant-scroll'), rarity: 'uncommon', sellPrice: 600, kind: 'crafting', maxStack: 999 });
add({ id: 'oyma_kalemi', name: 'Oyma Kalemi', desc: 'Eşyaya yeni bir taş yuvası açar (yuva sınırına kadar).', icon: ic('item-trinket'), rarity: 'rare', sellPrice: 900, kind: 'crafting', maxStack: 999 });
add({ id: 'av_muhru', name: 'Av Mührü', desc: 'Günlük görevlerden kazanılan para birimi. Mühürdar\'dan nadir malzemeler alınır.', icon: ic('item-coins'), rarity: 'uncommon', sellPrice: 0, kind: 'currency', maxStack: 9999 });

// ------------------------------------------------------------------ PvP (GDD_PVP_FINDER §4.2): one spend balance per currency
// Onur: world PvP honour and arena rewards (daily cap 1500 on earning, PvpGear.grantOnur). Fetih: ranked arena only (weekly cap).
add({ id: 'onur_puani', name: 'Onur Puanı', desc: 'Dünya PvP\'sinde, arenada ve günün ilk galibiyetinde kazanılır. Savaş Ustası\'ndan Er tier PvP eşyası alınır. Günlük kazanç sınırı 1500.', icon: ic('item-coins'), rarity: 'rare', sellPrice: 0, kind: 'currency', maxStack: 99999 });
add({ id: 'fetih_puani', name: 'Fetih Puanı', desc: 'Dereceli arenada kazanılır. Fetih Muhafızı\'ndan Şampiyon tier PvP eşyası alınır. Haftalık kazanç sınırı vardır.', icon: ic('item-coins'), rarity: 'epic', sellPrice: 0, kind: 'currency', maxStack: 99999 });
add({ id: 'fetih_muhru', name: 'Fetih Mührü', desc: 'PvP eşyalarını yükseltmek için kullanılır (Fetih Muhafızı).', icon: ic('item-crystal'), rarity: 'epic', sellPrice: 0, kind: 'upgrade', maxStack: 9999 });

// ------------------------------------------------------------------ open world (GDD_OPENWORLD 4.6, 6.2-6.4)
add({ id: 'metin_kalintisi', name: 'Metin Kalıntısı', desc: 'Vadi\'nin yüreğindeki kara taşlardan, nadir yaratıklardan ve ara patronlardan düşer. Kalıntı Tüccarı\'nda kullanılır.', icon: ic('item-crystal-shard'), rarity: 'epic', sellPrice: 10, kind: 'currency', maxStack: 9999 });
add({ id: 'beceri_kitabi_1', name: 'Beceri Kitabı I (Çırak)', desc: 'Bir becerinin seviyesini 3. kademeye kadar yükseltir. Beceriler panelinden okunur.', icon: ic('ui-spellbook'), rarity: 'uncommon', sellPrice: 30, kind: 'consumable', maxStack: 99 });
add({ id: 'beceri_kitabi_2', name: 'Beceri Kitabı II (Usta)', desc: 'Bir becerinin seviyesini 5. kademeye kadar yükseltir. Beceriler panelinden okunur.', icon: ic('ui-spellbook'), rarity: 'rare', sellPrice: 120, kind: 'consumable', maxStack: 99 });
add({ id: 'beceri_kitabi_3', name: 'Beceri Kitabı III (Üstat)', desc: 'Bir becerinin seviyesini 6. kademeye kadar yükseltir. Beceriler panelinden okunur.', icon: ic('ui-spellbook'), rarity: 'epic', sellPrice: 400, kind: 'consumable', maxStack: 99 });
// Av Defteri trophies (collection, GDD 6.4)
add({ id: 'trophy_kurt_disi', name: 'Kurt Dişi', desc: 'Av Defteri adım 1 için toplanır.', icon: ic('ui-trophy'), rarity: 'common', sellPrice: 2, kind: 'quest', maxStack: 99 });
add({ id: 'trophy_domuz_disi', name: 'Domuz Dişi', desc: 'Av Defteri adım 2 için toplanır.', icon: ic('ui-trophy'), rarity: 'common', sellPrice: 2, kind: 'quest', maxStack: 99 });
add({ id: 'trophy_haydut_muhru', name: 'Haydut Mührü', desc: 'Av Defteri adım 3 için toplanır.', icon: ic('ui-trophy'), rarity: 'uncommon', sellPrice: 3, kind: 'quest', maxStack: 99 });
add({ id: 'trophy_zehir_ozu', name: 'Bataklık Özü', desc: 'Av Defteri adım 4 için toplanır.', icon: ic('item-potion-flask'), rarity: 'uncommon', sellPrice: 3, kind: 'quest', maxStack: 99 });
add({ id: 'trophy_ork_disi', name: 'Ork Dişi Kolye', desc: 'Av Defteri adım 5 için toplanır.', icon: ic('ui-trophy'), rarity: 'rare', sellPrice: 4, kind: 'quest', maxStack: 99 });
add({ id: 'trophy_lanetli_kemik', name: 'Lanetli Kemik', desc: 'Av Defteri adım 6 için toplanır.', icon: ic('ui-trophy'), rarity: 'rare', sellPrice: 4, kind: 'quest', maxStack: 99 });
// Side-quest collection items (only drop while their quest is active)
add({ id: 'item_geyik_derisi', name: 'Geyik Derisi', desc: 'Avcı Yıldız\'ın istediği deri. Yalnızca görev aktifken düşer.', icon: ic('item-chest-leather'), rarity: 'common', sellPrice: 2, kind: 'quest', maxStack: 99 });
add({ id: 'item_cadi_otu', name: 'Cadı Otu', desc: 'Bataklık Cadısı\'nın bulunduğu otlardan. Yalnızca görev aktifken düşer.', icon: ic('item-potion-flask'), rarity: 'uncommon', sellPrice: 3, kind: 'quest', maxStack: 99 });
// Story seal pieces (main quest mq_19 needs all four; no stack)
add({ id: 'item_muhur_parcasi_1', name: 'Kadim Mühür Parçası I', desc: 'Kadim Mühür\'ün ilk parçası. Kuzgunkale\'ye getirilmelidir.', icon: ic('item-crystal'), rarity: 'epic', sellPrice: 0, kind: 'quest', maxStack: 1 });
add({ id: 'item_muhur_parcasi_2', name: 'Kadim Mühür Parçası II', desc: 'Kadim Mühür\'ün ikinci parçası. Kuzgunkale\'ye getirilmelidir.', icon: ic('item-crystal'), rarity: 'epic', sellPrice: 0, kind: 'quest', maxStack: 1 });
add({ id: 'item_muhur_parcasi_3', name: 'Kadim Mühür Parçası III', desc: 'Kadim Mühür\'ün üçüncü parçası. Kuzgunkale\'ye getirilmelidir.', icon: ic('item-crystal'), rarity: 'epic', sellPrice: 0, kind: 'quest', maxStack: 1 });
add({ id: 'item_muhur_parcasi_4', name: 'Kadim Mühür Parçası IV', desc: 'Kadim Mühür\'ün son parçası. Kuzgunkale\'ye getirilmelidir.', icon: ic('item-crystal'), rarity: 'epic', sellPrice: 0, kind: 'quest', maxStack: 1 });
// Region quest collection items (data/world/quests_extra.ts): drop from the region's creatures while their quest is active
const QUEST_ITEM = (id: string, name: string, desc: string, icon: string, rarity: Rarity = 'common'): void =>
  add({ id, name, desc, icon: ic(icon), rarity, sellPrice: 0, kind: 'quest', maxStack: 99 });
QUEST_ITEM('item_goblin_kulagi', 'Goblin Kulağı', 'Goblin Yağmacıların kulakları. Ödül avcıları her biri için bir kulak ister.', 'ui-trophy');
QUEST_ITEM('item_orman_balı', 'Orman Balı', 'Orman arılarının kovanından alınmış koyu bal.', 'item-potion-flask');
QUEST_ITEM('item_mantar_sapi', 'Şifalı Mantar Sapı', 'Mantarcıkların sapı. Rahibe Meryem bu mantarlardan merhem yapar.', 'item-junk');
QUEST_ITEM('item_saman_cobani', 'Saman Demeti', 'Korkulukların içinden çıkan saman. Çiftçiler yenisini bekliyor.', 'item-junk');
QUEST_ITEM('item_mezar_tozu', 'Mezar Tozu', 'Çürümüş köylülerin mezarından dökülen kutsanmamış toz.', 'item-crystal-shard', 'uncommon');
QUEST_ITEM('item_yarasa_kanadi', 'Yarasa Kanadı', 'Mağara yarasalarının zarlı kanadı.', 'item-junk');
QUEST_ITEM('item_kurt_postu', 'Kurt Postu', 'Orman ve tepe kurtlarının kalın postu. Kervancılar iyi post arıyor.', 'item-chest-leather');
QUEST_ITEM('item_haydut_kemeri', 'Haydut Kemeri', 'Haydutların ganimet kemeri. Üzerinde karakol mührü var.', 'item-bag', 'uncommon');
QUEST_ITEM('item_puglin_disi', 'Puglin Dişi', 'Puglin Yağmacıların sarı dişleri.', 'ui-trophy');
QUEST_ITEM('item_camur_kesesi', 'Çamur Kesesi', 'Bataklık çamurunun içinde şişmiş zehirli bir kese.', 'item-potion-orb', 'uncommon');
QUEST_ITEM('item_hortlak_parcasi', 'Hortlak Parçası', 'Ağıt hortlaklarının soluk, ışıldayan parçası.', 'item-crystal', 'uncommon');
QUEST_ITEM('item_ciyan_kabugu', 'Çıyan Kabuğu', 'Çürük çıyanların sert kabuğu. Simyacılar ezip kullanır.', 'item-trinket');
QUEST_ITEM('item_ork_kemigi', 'Ork Kemiği', 'Ork savaşçılarının iri kemikleri. Kanyonda ağırlık olarak kullanılır.', 'item-junk');
QUEST_ITEM('item_kor_kristali', 'Kor Kristali', 'Kor elementallerinin içinden çıkan sıcak kristal.', 'item-gem-fire', 'rare');
QUEST_ITEM('item_tas_parcasi', 'Kanyon Taş Parçası', 'Kanyon golemlerinin kırık taşı.', 'item-ore', 'uncommon');
QUEST_ITEM('item_kirik_kemik', 'Kırık Kemik', 'Harabelerdeki iskeletlerin kırık kemikleri.', 'item-junk');
QUEST_ITEM('item_tarikat_muhru', 'Tarikat Mührü', 'Kara Tarikat müritlerinin taşıdığı mühür. Nöbetçiler bunu kanıt sayar.', 'item-scroll-tied', 'uncommon');
QUEST_ITEM('item_karabiyik_muhru', 'Karabıyık Mührü', 'Haydut Kralı Karabıyık\'ın adamlarına dağıttığı kara mühür. Üzerinde bataklık sembolü var.', 'item-scroll-tied', 'uncommon');
QUEST_ITEM('item_lanet_sizintisi', 'Lanet Sızıntısı', 'Gulyabanilerden ve bataklık ışıklarından süzülen kara sıvı. Otacı Filiz kaynağını arıyor.', 'item-potion-orb', 'uncommon');
QUEST_ITEM('item_golge_ozu', 'Gölge Özü', 'Gölgelerin dağılırken geride bıraktığı koyu öz.', 'item-crystal-shard', 'rare');
// Karakır Bozkırı quest items (data/world/karakir_quests.ts)
QUEST_ITEM('item_bozkir_postu', 'Bozkır Kurdu Postu', 'Bozkır kurtlarının kalın, kum rengi postu. Çoban Kerem kışlık mont için istiyor.', 'item-chest-leather');
QUEST_ITEM('item_corak_kristali', 'Çorak Kristali', 'Kızıl Çorak yaratıklarının içinden çıkan, ısı saçan kristal.', 'item-crystal', 'uncommon');
QUEST_ITEM('item_kervan_muhru', 'Eski Kervan Mührü', 'Kayıp bir kervanın mühürü. Avcı Börte yolun nerede kesildiğini bundan okuyabiliyor.', 'item-scroll-tied', 'uncommon');
QUEST_ITEM('item_kul_tozu', 'Kül Tozu', 'Kül Ovası yaratıklarının içinde biriken, ateşe dayanıklı ince toz.', 'item-ore', 'uncommon');
QUEST_ITEM('item_kartal_tuyu', 'Dev Kartal Tüyü', 'Kartal Sırtı karakuşlarının sert, uzun tüyü. Ok yapımında aranıyor.', 'item-crystal', 'uncommon');

// ------------------------------------------------------------------ potions (GDD 6.4 / 6.5)
const POTION_TIER_NAMES = ['Küçük', 'Orta', 'Büyük', 'Güçlü', 'Kadim'];
const POTION_RARITY: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'epic'];
const HP_PRICE = [10, 40, 120, 300, 600];
const RES_PRICE = [8, 32, 96, 240, 480];
const POTION_LEVEL = [1, 15, 30, 45, 60];
const POTION_PCT = [0.25, 0.35, 0.45, 0.55, 0.65];
for (let t = 1; t <= 5; t++) {
  add({
    id: `pot_hp_${t}`, name: `${POTION_TIER_NAMES[t - 1]} Can İksiri`,
    desc: `Maks. canının %${Math.round(POTION_PCT[t - 1] * 100)} kadarını yeniler (%60 anında, %40 3 sn içinde). Tüm can iksirleri 10 sn bekleme süresini paylaşır.`,
    icon: ic('item-potion-health'), rarity: POTION_RARITY[t - 1], sellPrice: Math.floor(HP_PRICE[t - 1] / 4), buyPrice: HP_PRICE[t - 1], kind: 'consumable',
    maxStack: 99, requiredLevel: POTION_LEVEL[t - 1],
    potion: { kind: 'hp', tier: t, pct: POTION_PCT[t - 1], instantFrac: 0.6, overTime: 3, cooldown: 10 },
  });
  add({
    id: `pot_res_${t}`, name: `${POTION_TIER_NAMES[t - 1]} Ruh İksiri`,
    desc: `Maks. kaynağının %${Math.round(POTION_PCT[t - 1] * 100)} kadarını anında yeniler. Tüm ruh iksirleri 15 sn bekleme süresini paylaşır.`,
    icon: ic('item-potion-mana'), rarity: POTION_RARITY[t - 1], sellPrice: Math.floor(RES_PRICE[t - 1] / 4), buyPrice: RES_PRICE[t - 1], kind: 'consumable',
    maxStack: 99, requiredLevel: POTION_LEVEL[t - 1],
    potion: { kind: 'mp', tier: t, pct: POTION_PCT[t - 1], instantFrac: 1, overTime: 0, cooldown: 15 },
  });
}
add({ id: 'scroll_town', name: 'Dönüş Parşömeni', desc: '3 saniye okunur ve şehre bir geçit açar. Mitik+ koşularında kullanılamaz.', icon: ic('item-scroll'), rarity: 'common', sellPrice: 6, buyPrice: 25, kind: 'consumable', maxStack: 99, scroll: true });

// ------------------------------------------------------------------ elixirs (GDD 6.5)
const ELIXIRS: { id: string; name: string; desc: string; cat: 'war' | 'guard' | 'help'; mins: number; price: number; stats: StatBlock; noMythic?: boolean; level: number }[] = [
  { id: 'elixir_might', name: 'Kudret İksiri', desc: '30 dk boyunca hasarını %10 artırır.', cat: 'war', mins: 30, price: 2500, stats: { damagePct: 0.1 }, level: 20 },
  { id: 'elixir_swiftness', name: 'Rüzgâr İksiri', desc: '30 dk boyunca hareket hızını %8, saldırı ve büyü hızını %5 artırır.', cat: 'war', mins: 30, price: 2000, stats: { moveSpeedPct: 0.08, attackSpeed: 0.05, castSpeed: 0.05 }, level: 10 },
  { id: 'elixir_ironskin', name: 'Demir Deri İksiri', desc: '30 dk boyunca zırhını %15, tüm dirençlerini %10 artırır.', cat: 'guard', mins: 30, price: 2500, stats: { armorPct: 0.15, resAll: 0.1 }, level: 20 },
  { id: 'elixir_vitality', name: 'Hayat İksiri', desc: '30 dk boyunca maks. canını %10 artırır.', cat: 'guard', mins: 30, price: 2000, stats: { maxHpPct: 0.1 }, level: 10 },
  { id: 'elixir_wisdom', name: 'Bilgelik İksiri', desc: '60 dk boyunca kazandığın tecrübeyi %20 artırır (Mitik+ içinde etkisiz).', cat: 'help', mins: 60, price: 1500, stats: { xpPct: 0.2 }, noMythic: true, level: 5 },
  { id: 'elixir_fortune', name: 'Talih İksiri', desc: '30 dk boyunca altın bulmayı %25, büyülü eşya bulmayı %15 artırır.', cat: 'help', mins: 30, price: 4000, stats: { goldFindPct: 0.25, magicFindPct: 0.15 }, level: 30 },
];
const CAT_NAME = { war: 'Savaş', guard: 'Muhafız', help: 'Yardım' } as const;
for (const e of ELIXIRS) {
  add({
    id: e.id, name: e.name, desc: `${e.desc} Kategori: ${CAT_NAME[e.cat]} (kategori başına tek iksir). Süre yalnızca oyundayken akar.`,
    icon: ic('item-potion-elixir'), rarity: 'rare', sellPrice: Math.floor(e.price / 4), buyPrice: e.price, kind: 'consumable', maxStack: 20, requiredLevel: e.level,
    elixir: { category: e.cat, categoryName: CAT_NAME[e.cat], durationSec: e.mins * 60, stats: e.stats, noMythic: e.noMythic },
  });
}

// ------------------------------------------------------------------ gems (GDD 5.5): gem_<type>_<grade 1..6>
export const GEM_TYPES = ['ruby', 'emerald', 'sapphire', 'topaz', 'amethyst', 'diamond'] as const;
export type GemType = (typeof GEM_TYPES)[number];
export const GEM_TYPE_NAMES: Record<GemType, string> = { ruby: 'Yakut', emerald: 'Zümrüt', sapphire: 'Safir', topaz: 'Topaz', amethyst: 'Ametist', diamond: 'Elmas' };
export const GEM_COLORS: Record<GemType, string> = { ruby: '#e0303a', emerald: '#2ecc71', sapphire: '#2f6fe0', topaz: '#f2c037', amethyst: '#9b59d0', diamond: '#e8f4ff' };
export const GEM_GRADE_PREFIX = ['Kırık', 'Kusurlu', '', 'Kusursuz', 'Kraliyet', 'Kadim'];
export const GEM_GRADE_LEVEL = [1, 15, 30, 45, 60, 60];
const GEM_GRADE_RARITY: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'epic', 'legendary'];
const GEM_ICON: Record<GemType, string> = { ruby: 'item-gem-fire', emerald: 'item-gem-emerald', sapphire: 'item-gems', topaz: 'item-gems', amethyst: 'item-gems', diamond: 'item-gem-diamond' };
export const gemId = (type: string, grade: number) => `gem_${type}_${grade}`;
export function gemName(type: GemType, grade: number): string {
  const p = GEM_GRADE_PREFIX[grade - 1];
  return p ? `${p} ${GEM_TYPE_NAMES[type]}` : GEM_TYPE_NAMES[type];
}
for (const type of GEM_TYPES) {
  for (let g = 1; g <= 6; g++) {
    add({
      id: gemId(type, g), name: gemName(type, g), desc: 'Eşyalardaki taş yuvalarına yerleştirilir. Aynı türden 3 taş Demirci\'de bir üst kademeye birleşir.',
      icon: ic(GEM_ICON[type]), rarity: GEM_GRADE_RARITY[g - 1], sellPrice: 50 * 3 ** (g - 1), buyPrice: g === 1 ? 500 : undefined, kind: 'crafting', maxStack: 9999,
      requiredLevel: GEM_GRADE_LEVEL[g - 1], gem: { type, grade: g },
    });
  }
}

// ------------------------------------------------------------------ CM14 Pazar licences (data/market.ts BOHCA_DEFS)
for (const b of BOHCA_DEFS) {
  add({ id: b.id, name: b.name, desc: b.desc, icon: ic('item-bag'), rarity: b.slots > 12 ? 'rare' : 'uncommon', sellPrice: 0, buyPrice: b.price, kind: 'consumable', maxStack: 99, market: { slots: b.slots } });
}

// ------------------------------------------------------------------ gathering professions MVP (GDD_LIFE §1.9, tiers 1-6 nodes)
const GATHER_MAT = (id: string, name: string, desc: string, icon: string, rarity: Rarity, sellPrice: number): MaterialDef => ({
  id, name, desc, icon, rarity, sellPrice, kind: 'crafting', maxStack: 9999,
});
add(GATHER_MAT('ore_copper', 'Bakır Cevheri', 'Madencilik. Bakır damarından çıkar. Külçeye dönüştürülür.', ic('item-ore'), 'common', 2));
add(GATHER_MAT('ore_iron', 'Demir Cevheri', 'Madencilik. Demir damarından çıkar. Külçeye dönüştürülür.', ic('item-ore'), 'common', 5));
add(GATHER_MAT('ore_silver', 'Gümüş Cevheri', 'Madencilik. Gümüş damarından çıkar.', ic('item-ore'), 'uncommon', 12));
add(GATHER_MAT('ore_gold', 'Altın Cevheri', 'Madencilik. Altın damarından çıkar.', ic('item-ore'), 'uncommon', 30));
add(GATHER_MAT('ore_dragon', 'Ejder Taşı Cevheri', 'Madencilik. Ejder Taşı damarından çıkar.', ic('item-ore'), 'rare', 80));
add(GATHER_MAT('ore_ancient', 'Kadim Kristal Cevheri', 'Madencilik. Kadim Kristal damarından çıkar.', ic('item-crystal-shard'), 'epic', 200));
add(GATHER_MAT('coal', 'Kömür', 'Ocakta yakıt olarak kullanılır.', ic('item-ore'), 'common', 3));
add(GATHER_MAT('ingot_copper', 'Bakır Külçe', 'Bakır cevherinin eritilmiş hali. Bileme taşı yapımında kullanılır.', ic('item-metal-bar'), 'common', 5));
add(GATHER_MAT('ingot_iron', 'Demir Külçe', 'Demir cevherinin eritilmiş hali. Bileme taşı yapımında kullanılır.', ic('item-metal-bar'), 'common', 12));
add(GATHER_MAT('bileme_tasi_1', 'Bileme Taşı I', 'Silahları bilemek için. Madencilikten üretilir.', ic('item-upgrade-stone'), 'uncommon', 15));
add(GATHER_MAT('bileme_tasi_2', 'Bileme Taşı II', 'Daha keskin bileme için. Madencilikten üretilir.', ic('item-upgrade-stone'), 'rare', 40));
add(GATHER_MAT('herb_daisy', 'Ak Papatya', 'Bitki Toplama. Şifa iksirinin yardımcı otu.', ic('map-herb'), 'common', 2));
add(GATHER_MAT('shroom_tan', 'Kahverengi Mantar', 'Bitki Toplama. Şifa iksirinin yardımcı mantarı.', ic('map-herb'), 'common', 2));
add(GATHER_MAT('herb_sage', 'Adaçayı', 'Bitki Toplama. Zihin iksirinin ana otu.', ic('map-herb'), 'common', 5));
add(GATHER_MAT('shroom_red', 'Zehirli Mantar', 'Bitki Toplama. Dikkatli kullanılmalı.', ic('map-herb'), 'common', 5));
add(GATHER_MAT('herb_wolfsbane', 'Kurt Otu', 'Bitki Toplama. Kurt Ormanı ve Kar Kurtları bölgelerinde bulunur.', ic('map-herb'), 'uncommon', 12));
add(GATHER_MAT('herb_dragontongue', 'Ejder Dili', 'Bitki Toplama. Ateşli bir bitki.', ic('map-herb'), 'uncommon', 30));
add(GATHER_MAT('herb_moonviolet', 'Ay Menekşesi', 'Bitki Toplama. Nadir bir menekşe.', ic('map-herb'), 'rare', 80));
add(GATHER_MAT('herb_lotus', 'Kadim Nilüfer', 'Bitki Toplama. Kadim sularda açar.', ic('map-herb'), 'epic', 200));
add(GATHER_MAT('pollen', 'Çiçek Tozu', 'Herhangi bir çiçekten düşen toz. Nadir bulgu.', ic('item-crystal-shard'), 'uncommon', 8));

// ------------------------------------------------------------------ pets (WP-12, data/pets.ts)
// One teaching item per pet: drops and event participants get it, using it from the pouch teaches the pet once.
for (const p of PETS) {
  add({ id: petItemId(p.id), name: `${p.name} Yumurtası`, desc: `Kullanınca ${p.name} evcil hayvanını öğretir. Bir kez kullanılır.`, icon: ic('item-trinket'), rarity: 'rare', sellPrice: 60, kind: 'consumable', maxStack: 99, teachesPet: p.id });
}

// ------------------------------------------------------------------ mounts (sprint2, data/mounts.ts)
// One teaching item per mount (vendor, drop or achievement). Using it from the pouch teaches the mount once; on the action bar
// the same id summons the mount (useBarMat), so a mount can be dragged from the Binekler tab onto a bar.
for (const m of MOUNTS) {
  const vendor = m.source.kind === 'vendor' ? m.source : null;
  add({ id: mountItemId(m.id), name: `${m.name} Tasması`, desc: `Kullanınca ${m.name} binekini öğretir. Öğrenilen binek F9 ile çağrılır.`, icon: ic('item-trinket'), rarity: 'rare', sellPrice: 60,
    ...(vendor ? { buyPrice: vendor.price, requiredLevel: vendor.level } : {}), kind: 'consumable', maxStack: 99, teachesMount: m.id });
}
// the action bar's summon cell (barDrop.useBarMat acts like F9; never in the pouch, so its count stays 0 and is never shown)
add({ id: MOUNT_CALL_ID, name: 'Binek Çağır', desc: 'Seçili binekini çağırır; binekteysen iner. F9 ile aynı.', icon: ic('item-trinket'), rarity: 'common', sellPrice: 0, kind: 'consumable', maxStack: 1 });

// ------------------------------------------------------------------ helpers
/** All potion ids of a kind ('hp' | 'mp') ordered by tier. */
export const potionIds = (kind: 'hp' | 'mp'): string[] => [1, 2, 3, 4, 5].map((t) => (kind === 'hp' ? `pot_hp_${t}` : `pot_res_${t}`));

/** Best potion the character can use: highest tier with stock and requiredLevel <= level. */
export function bestPotion(kind: 'hp' | 'mp', level: number, owned: (id: string) => number): string | null {
  const ids = potionIds(kind);
  for (let i = ids.length - 1; i >= 0; i--) {
    const def = MATERIALS[ids[i]];
    if (def && (def.requiredLevel ?? 1) <= level && owned(ids[i]) > 0) return ids[i];
  }
  return null;
}

export function materialSellPrice(id: string): number {
  return MATERIALS[id]?.sellPrice ?? 1;
}
