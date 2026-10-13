/**
 * WP-08 achievements and titles (docs/MMO_PILLARS.md). Pure data: systems/Achievements.ts feeds the metrics from game events,
 * ui/panels/game/achievements.ts shows them. Ids are append-only (they are stored in saves): never rename or reuse one.
 *
 * Metric kinds: `add` = counter (sum of event amounts), `max` = highest value seen, `set` = distinct ids seen.
 * Points are 5 / 10 / 25. A title (`title`) is granted on unlock; its id is the achievement id (CharacterSave.titles).
 */

export type AchCategory = 'seviye' | 'kesif' | 'gorev' | 'zindan' | 'mitik' | 'savas' | 'ekonomi' | 'sosyal';

export const ACH_CATEGORIES: { id: AchCategory; name: string }[] = [
  { id: 'seviye', name: 'Seviye' },
  { id: 'kesif', name: 'Keşif' },
  { id: 'gorev', name: 'Görev' },
  { id: 'zindan', name: 'Zindan' },
  { id: 'mitik', name: 'Mitik+' },
  { id: 'savas', name: 'Savaş' },
  { id: 'ekonomi', name: 'Toplama / Ekonomi' },
  { id: 'sosyal', name: 'Sosyal' },
];

/** How a metric accumulates (see the file header). */
export const METRIC_KIND = {
  level: 'max',
  waypoints: 'set',
  regions: 'set',
  quests: 'set',
  routes: 'set',
  dungeonsSeen: 'set',
  dungeonClears: 'add',
  bossKills: 'add',
  mplusClears: 'add',
  mplusKey: 'max',
  mplusInTime: 'add',
  mythicClears: 'add',
  kills: 'add',
  perfectParry: 'add',
  finishers: 'add',
  majors: 'add',
  honor: 'max',
  goldEarned: 'add',
  upgradeOk: 'add',
  upgradeMax: 'max',
  gathers: 'add',
  profSkill: 'max',
  sales: 'add',
  legendary: 'add',
  mount: 'max',
  partyJoins: 'add',
  whispers: 'add',
  emotes: 'add',
  // WP-10 daily loop (systems/DailyLoop.ts)
  loginStreak: 'max',
  worldQuests: 'add',
  dailyDungeons: 'add',
  chats: 'add',
} as const;

export type AchMetric = keyof typeof METRIC_KIND;
export type AchPoints = 5 | 10 | 25;

export interface AchievementDef {
  /** Stable id (saved). Also the id of the title it grants. */
  id: string;
  cat: AchCategory;
  name: string;
  desc: string;
  points: AchPoints;
  metric: AchMetric;
  /** Progress needed (counter sum, highest value or distinct count). */
  target: number;
  /** Title shown in the title picker once unlocked. */
  title?: string;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  // ---- Seviye (level milestones; metric `level`)
  { id: 'sev_lv5', cat: 'seviye', name: 'Çırak', desc: 'Seviye 5\'e ulaş.', points: 5, metric: 'level', target: 5 },
  { id: 'sev_lv10', cat: 'seviye', name: 'Yolcu', desc: 'Seviye 10\'a ulaş.', points: 5, metric: 'level', target: 10 },
  { id: 'sev_lv15', cat: 'seviye', name: 'Tecrübeli', desc: 'Seviye 15\'e ulaş.', points: 10, metric: 'level', target: 15 },
  { id: 'sev_lv20', cat: 'seviye', name: 'Gezgin', desc: 'Seviye 20\'ye ulaş.', points: 10, metric: 'level', target: 20 },
  { id: 'sev_lv30', cat: 'seviye', name: 'Kadim Yoldaş', desc: 'Seviye 30\'a ulaş.', points: 25, metric: 'level', target: 30, title: 'Kadim Yoldaş' },
  { id: 'sev_lv40', cat: 'seviye', name: 'Yiğit', desc: 'Seviye 40\'a ulaş.', points: 10, metric: 'level', target: 40 },
  { id: 'sev_lv50', cat: 'seviye', name: 'Yüce', desc: 'Seviye 50\'ye ulaş.', points: 25, metric: 'level', target: 50, title: 'Yüce' },
  { id: 'sev_lv60', cat: 'seviye', name: 'Sınır Aşan', desc: 'Seviye 60\'a ulaş.', points: 25, metric: 'level', target: 60, title: 'Sınır Aşan' },

  // ---- Keşif (waypoints and map regions; sets of ids)
  { id: 'kesif_wp1', cat: 'kesif', name: 'İlk Işınlanma', desc: 'İlk Işınlayıcıyı keşfet.', points: 5, metric: 'waypoints', target: 1 },
  { id: 'kesif_wp5', cat: 'kesif', name: 'Yol Haritası', desc: '5 Işınlayıcıyı keşfet.', points: 10, metric: 'waypoints', target: 5 },
  { id: 'kesif_wp_all', cat: 'kesif', name: 'Işınlayıcı Ustası', desc: 'Bütün Işınlayıcıları keşfet.', points: 25, metric: 'waypoints', target: 11, title: 'Yol Bilge' },
  { id: 'kesif_reg1', cat: 'kesif', name: 'Kapıyı Aç', desc: 'İlk bölgeye adım at.', points: 5, metric: 'regions', target: 1 },
  { id: 'kesif_reg3', cat: 'kesif', name: 'Diyar Gezgini', desc: '3 farklı bölgeye gir.', points: 10, metric: 'regions', target: 3 },
  { id: 'kesif_reg_all', cat: 'kesif', name: 'Kadim Haritacı', desc: 'Bütün bölgeleri keşfet.', points: 25, metric: 'regions', target: 6, title: 'Haritacı' },

  // ---- Görev (distinct quests completed)
  { id: 'gorev_1', cat: 'gorev', name: 'İlk Görev', desc: 'Bir görevi tamamla.', points: 5, metric: 'quests', target: 1 },
  { id: 'gorev_5', cat: 'gorev', name: 'Görevli', desc: '5 görevi tamamla.', points: 5, metric: 'quests', target: 5 },
  { id: 'gorev_15', cat: 'gorev', name: 'Hizmetkâr', desc: '15 görevi tamamla.', points: 10, metric: 'quests', target: 15 },
  { id: 'gorev_30', cat: 'gorev', name: 'Görev Peşinde', desc: '30 görevi tamamla.', points: 10, metric: 'quests', target: 30 },
  { id: 'gorev_60', cat: 'gorev', name: 'Görev Adamı', desc: '60 görevi tamamla.', points: 25, metric: 'quests', target: 60, title: 'Görev Adamı' },
  { id: 'gorev_100', cat: 'gorev', name: 'Kadim Emir', desc: '100 görevi tamamla.', points: 25, metric: 'quests', target: 100 },
  { id: 'gorev_gun7', cat: 'gorev', name: 'Sadık Gezgin', desc: '7 gün üst üste oyuna gir.', points: 10, metric: 'loginStreak', target: 7 },
  { id: 'gorev_dunya30', cat: 'gorev', name: 'Dünya Görevlisi', desc: 'Dünya görevlerini 30 kez tamamla.', points: 10, metric: 'worldQuests', target: 30 },
  { id: 'gorev_gunzindan10', cat: 'gorev', name: 'Günün Kahramanı', desc: 'Günün Zindanı\'nı 10 kez temizle.', points: 25, metric: 'dailyDungeons', target: 10, title: 'Günün Kahramanı' },

  // ---- Zindan (dungeon clears, distinct dungeons, boss kills)
  { id: 'zin_clear1', cat: 'zindan', name: 'İlk Zindan', desc: 'Bir zindanı temizle.', points: 5, metric: 'dungeonClears', target: 1 },
  { id: 'zin_clear5', cat: 'zindan', name: 'Zindan Temizleyici', desc: '5 zindan temizle.', points: 10, metric: 'dungeonClears', target: 5 },
  { id: 'zin_clear25', cat: 'zindan', name: 'Zindan Kurdu', desc: '25 zindan temizle.', points: 25, metric: 'dungeonClears', target: 25, title: 'Zindan Kurdu' },
  { id: 'zin_distinct3', cat: 'zindan', name: 'Çok Yönlü', desc: '3 farklı zindanı temizle.', points: 5, metric: 'dungeonsSeen', target: 3 },
  { id: 'zin_distinct6', cat: 'zindan', name: 'Her Kapı', desc: '6 farklı zindanı temizle.', points: 25, metric: 'dungeonsSeen', target: 6 },
  { id: 'zin_boss1', cat: 'zindan', name: 'İlk Patron', desc: 'Bir patronu yen.', points: 5, metric: 'bossKills', target: 1 },
  { id: 'zin_boss10', cat: 'zindan', name: 'Patron Avcısı', desc: '10 patron yen.', points: 10, metric: 'bossKills', target: 10 },
  { id: 'zin_boss50', cat: 'zindan', name: 'Patron Kırıcı', desc: '50 patron yen.', points: 25, metric: 'bossKills', target: 50, title: 'Patron Kırıcı' },

  // ---- Mitik+ (keys, timed clears)
  { id: 'mit_clear1', cat: 'mitik', name: 'İlk Anahtar', desc: 'Bir Mitik+ anahtarını tamamla.', points: 10, metric: 'mplusClears', target: 1 },
  { id: 'mit_clear10', cat: 'mitik', name: 'Anahtar Ustası', desc: '10 Mitik+ anahtarını tamamla.', points: 25, metric: 'mplusClears', target: 10, title: 'Anahtar Ustası' },
  { id: 'mit_key5', cat: 'mitik', name: 'Kadim Kapı', desc: 'Mitik+ 5 anahtarını tamamla.', points: 5, metric: 'mplusKey', target: 5 },
  { id: 'mit_key10', cat: 'mitik', name: 'Derinlik', desc: 'Mitik+ 10 anahtarını tamamla.', points: 10, metric: 'mplusKey', target: 10 },
  { id: 'mit_key15', cat: 'mitik', name: 'Mitik Efendi', desc: 'Mitik+ 15 anahtarını tamamla.', points: 25, metric: 'mplusKey', target: 15, title: 'Mitik Efendi' },
  { id: 'mit_time5', cat: 'mitik', name: 'Zamanla Yarış', desc: 'Süresi içinde 5 Mitik+ bitir.', points: 10, metric: 'mplusInTime', target: 5 },
  { id: 'mit_time25', cat: 'mitik', name: 'Saat Kuşu', desc: 'Süresi içinde 25 Mitik+ bitir.', points: 25, metric: 'mplusInTime', target: 25 },
  { id: 'mit_mythic1', cat: 'mitik', name: 'Mitik Zorluk', desc: 'Mitik zorlukta bir zindanı temizle.', points: 10, metric: 'mythicClears', target: 1 },

  // ---- Savaş (kills, parries, finishers, majors, honour, combo routes)
  { id: 'sav_kill10', cat: 'savas', name: 'İlk Kan', desc: '10 düşman öldür.', points: 5, metric: 'kills', target: 10 },
  { id: 'sav_kill1000', cat: 'savas', name: 'Savaş Ağası', desc: '1000 düşman öldür.', points: 25, metric: 'kills', target: 1000, title: 'Savaş Ağası' },
  { id: 'sav_parry10', cat: 'savas', name: 'Savuşturucu', desc: '10 mükemmel savuşturma yap.', points: 5, metric: 'perfectParry', target: 10 },
  { id: 'sav_parry100', cat: 'savas', name: 'Mükemmel Refleks', desc: '100 mükemmel savuşturma yap.', points: 10, metric: 'perfectParry', target: 100 },
  { id: 'sav_finish25', cat: 'savas', name: 'Kritik Yıkım', desc: '25 Kritik Vuruş bitirişi yap.', points: 10, metric: 'finishers', target: 25 },
  { id: 'sav_major50', cat: 'savas', name: 'Büyük Hamle', desc: '50 büyük yeteneği kullan.', points: 10, metric: 'majors', target: 50 },
  { id: 'sav_honor500', cat: 'savas', name: 'Onurlu', desc: '500 Onur kazan.', points: 10, metric: 'honor', target: 500 },
  { id: 'sav_rota3', cat: 'savas', name: 'Rota Ustası', desc: '3 farklı savaş rotasını tamamla.', points: 10, metric: 'routes', target: 3 },

  // ---- Toplama / Ekonomi (gold, upgrades, gathering, market, loot)
  { id: 'eko_gold1k', cat: 'ekonomi', name: 'Küçük Kese', desc: 'Toplam 1.000 altın kazan.', points: 5, metric: 'goldEarned', target: 1000 },
  { id: 'eko_gold100k', cat: 'ekonomi', name: 'Kese Dolgunu', desc: 'Toplam 100.000 altın kazan.', points: 10, metric: 'goldEarned', target: 100000 },
  { id: 'eko_gold1m', cat: 'ekonomi', name: 'Altın Kral', desc: 'Toplam 1.000.000 altın kazan.', points: 25, metric: 'goldEarned', target: 1000000, title: 'Zengin' },
  { id: 'eko_up9', cat: 'ekonomi', name: 'Dokuz Kere Usta', desc: 'Bir eşyayı +9\'a yükselt.', points: 10, metric: 'upgradeMax', target: 9 },
  { id: 'eko_up12', cat: 'ekonomi', name: 'Kadim Demirci', desc: 'Bir eşyayı +12\'ye yükselt.', points: 25, metric: 'upgradeMax', target: 12, title: 'Kadim Demirci' },
  { id: 'eko_upok50', cat: 'ekonomi', name: 'Demirci Çırağı', desc: '50 başarılı yükseltme yap.', points: 10, metric: 'upgradeOk', target: 50 },
  { id: 'eko_gather50', cat: 'ekonomi', name: 'Toplayıcı', desc: '50 kaynak topla.', points: 10, metric: 'gathers', target: 50 },
  { id: 'eko_prof50', cat: 'ekonomi', name: 'Usta Meslek', desc: 'Bir mesleğini 50\'ye çıkar.', points: 10, metric: 'profSkill', target: 50 },
  { id: 'eko_sale1', cat: 'ekonomi', name: 'İlk Satış', desc: 'Pazarda bir eşya sat.', points: 5, metric: 'sales', target: 1 },
  { id: 'eko_sale20', cat: 'ekonomi', name: 'Pazarcı', desc: 'Pazarda 20 satış yap.', points: 10, metric: 'sales', target: 20, title: 'Pazarcı' },
  { id: 'eko_legend1', cat: 'ekonomi', name: 'Efsanevi Buluş', desc: 'Bir efsanevi eşya bul.', points: 10, metric: 'legendary', target: 1 },
  { id: 'eko_mount1', cat: 'ekonomi', name: 'Binici', desc: 'Bir binek kullan.', points: 5, metric: 'mount', target: 1 },

  // ---- Sosyal (party, whispers, chat, emotes)
  { id: 'sos_party1', cat: 'sosyal', name: 'Yoldaş', desc: 'Grubuna bir oyuncu katılsın.', points: 5, metric: 'partyJoins', target: 1 },
  { id: 'sos_party10', cat: 'sosyal', name: 'Grup Ruhu', desc: 'Gruba 10 kez oyuncu katıl.', points: 10, metric: 'partyJoins', target: 10 },
  { id: 'sos_party50', cat: 'sosyal', name: 'Grup Lideri', desc: 'Gruba 50 kez oyuncu katıl.', points: 25, metric: 'partyJoins', target: 50, title: 'Grup Lideri' },
  { id: 'sos_whisper1', cat: 'sosyal', name: 'Fısıltı', desc: 'Bir özel mesaj gönder.', points: 5, metric: 'whispers', target: 1 },
  { id: 'sos_chat100', cat: 'sosyal', name: 'Konuşkan', desc: '100 sohbet satırı yaz.', points: 10, metric: 'chats', target: 100 },
  { id: 'sos_emote20', cat: 'sosyal', name: 'Dansçı', desc: '20 hareket (emote) kullan.', points: 5, metric: 'emotes', target: 20 },
];

export const ACHIEVEMENT_BY_ID: Readonly<Record<string, AchievementDef>> = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

/** Sum of every achievement's points (the panel's total). */
export const ACHIEVEMENT_POINTS_TOTAL = ACHIEVEMENTS.reduce((s, a) => s + a.points, 0);
