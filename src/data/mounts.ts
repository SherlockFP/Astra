/**
 * Binek koleksiyonu (WoW / Trove tarzı). Saf veri: systems/Mounts.ts öğrenir ve seçer, game/Mount.ts voxel modeli kurar,
 * ui/panels/game/collection.ts (Binekler sekmesi) listeler. Her binek +%60 koşu hızı verir (MOUNT_SPEED_MUL).
 *
 * Kimlikler kayıtlıdır (CharacterSave.mounts): asla yeniden adlandırma ya da yeniden kullanma. Her binekin bir kaynağı vardır:
 *   vendor  Kuzgunkale Ahır Ustası'ndan altınla (VendorPanel kind 'stable'); öğe `mountItemId(id)`, `buyPrice` ile
 *   drop    bir öğreten öğe (`mountItemId`) adlandırılmış ganimet tablosunda (loot.ts bonus)
 *   ach     başarım açılınca öğrenilir (`mount` alanı, data/achievements.ts)
 * `text` panelde gösterilen Türkçe kaynak satırıdır.
 */

/** Model ailesi, game/Mount.ts içinde kutulardan kurulur. */
export type MountShape = 'horse' | 'wolf' | 'ram' | 'boar' | 'stag' | 'drake';

export type MountSource =
  | { kind: 'vendor'; price: number; level: number; text: string }
  | { kind: 'drop'; table: string; chance: number; text: string }
  | { kind: 'ach'; achId: string; text: string };

export interface MountDef {
  id: string;
  name: string;
  desc: string;
  shape: MountShape;
  /** Ana gövde rengi ve vurgu (yele, boynuz, gözler, kanatlar...). */
  color: number;
  accent: number;
  /** Büyülü vurgu (arkan parıltısı) emissive rengi; 0 = yok. */
  glow: number;
  /** Binme Sv gereksinimi; yoksa MOUNT_LEVEL (game/Mount.ts). Başlangıç binegi Sv 1. */
  level?: number;
  /** Koşu hızı çarpanı; yoksa MOUNT_SPEED_MUL. Başlangıç binegi biraz yavaş (+%40). */
  speed?: number;
  /** Gövdenin dikey salınımı: genlik (m) ve frekans (Hz), koşarken daha hızlı. */
  bob: { amp: number; hz: number };
  source: MountSource;
}

export const MOUNTS: MountDef[] = [
  { id: 'kir_at', name: 'Kır Atı', desc: 'Kuzgunkale yollarının sadık ilk atı.', shape: 'horse', color: 0x9a6a3c, accent: 0x3a2616, glow: 0, bob: { amp: 0.04, hz: 6 }, level: 1, speed: 1.4,
    source: { kind: 'vendor', price: 60, level: 10, text: 'Başlangıç binegi: her karakter Sv 1 seviyesinde ücretsiz alır (Ahır Ustası da satar)' } },
  { id: 'sisli_kurt', name: 'Sisli Kurt', desc: 'Sisli Mağara\'nın sisinden çıkan gümüş tüylü bir kurt.', shape: 'wolf', color: 0x7fa6cf, accent: 0xf2f7ff, glow: 0, bob: { amp: 0.05, hz: 9 },
    source: { kind: 'drop', table: 'loot_mag_bekci', chance: 0.05, text: 'Sisli Mağara son boss: Kadim Bekçi (%5 düşme)' } },
  { id: 'dag_kecisi', name: 'Dağ Keçisi', desc: 'Dik yamaçlarda bile durmayan, kıvrık boynuzlu bir koç.', shape: 'ram', color: 0xf0e4c8, accent: 0x7a5a3a, glow: 0, bob: { amp: 0.06, hz: 5 },
    source: { kind: 'vendor', price: 400, level: 20, text: 'Kuzgunkale Ahır Ustası: Dağ Keçisi (Sv 20, 400 altın)' } },
  { id: 'altin_domuz', name: 'Altın Tarla Domuzu', desc: 'Sisli Vadi tarlalarında altın kıllarıyla parlayan güçlü bir domuz.', shape: 'boar', color: 0xd9a520, accent: 0x5c3a12, glow: 0, bob: { amp: 0.035, hz: 8 },
    source: { kind: 'ach', achId: 'sav_vadi100', text: 'Başarım: Vadi Avcısı (Sisli Vadi\'de 100 düşman)' } },
  { id: 'kristal_geyik', name: 'Kristal Geyik', desc: 'Boynuzları büyülü kristallerle parlayan, sisin içinden gelen bir geyik.', shape: 'stag', color: 0xb9c7d6, accent: 0x7ff0ff, glow: 0x3ad8ff, bob: { amp: 0.05, hz: 7 },
    source: { kind: 'ach', achId: 'mag_sis', text: 'Başarım: Mağaradaki Sis (Sisli Mağara\'yı 3 kez temizle)' } },
  { id: 'gumus_ejder', name: 'Gümüş Ejder', desc: 'Küçük ama ateşli bir gümüş ejder yavrusu. Şimdilik yerde koşar.', shape: 'drake', color: 0xd8e4f4, accent: 0x5a7ea8, glow: 0xff9a4a, bob: { amp: 0.07, hz: 6 },
    source: { kind: 'drop', table: 'loot_rare_gumus_ejder', chance: 0.1, text: 'Nadir düşman: Gümüş Ejder Yavrusu (%10 düşme)' } },
];

export const MOUNT_BY_ID: Record<string, MountDef> = Object.fromEntries(MOUNTS.map((m) => [m.id, m]));

/** The starter mount: the first one a fresh character can learn (the riding lesson at the stable). */
export const STARTER_MOUNT_ID = 'kir_at';

/** Teaching item id of a mount (a material with `teachesMount`, data/materials.ts). The action bar also holds this id. */
export const mountItemId = (mountId: string): string => `mount_${mountId}`;

/**
 * The action bar's summon cell (materials.ts `MOUNT_CALL_ID`, placed by defaultExtraBar.ts): clicking it acts like F9 (the mount
 * systems/Mounts.ts summons, or dismounts when riding). It is never a pouch stack, so the bar shows no count.
 */
export const MOUNT_CALL_ID = 'mount_call';
