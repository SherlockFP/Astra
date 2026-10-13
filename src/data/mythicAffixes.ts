import type { AffixId, MythicAffixDef } from '../types/mythic';
import type { KeystoneData } from '../types/items';
import { weekIndex } from '../core/utils';

/**
 * Mythic+ data: affix definitions (GDD_CONTENT 5.5), weekly rotation (5.6), scaling (5.4), score/rating (5.9),
 * thresholds, loot item levels (GDD_SYSTEMS 7.4) and Turkish strings (5.14). Pure data + pure helpers (no G access).
 * OWNER: mythic+ module.
 */

const ICON = (id: string) => `/assets/icons/affix-${id}.svg`;

export const MYTHIC_AFFIXES: Partial<Record<AffixId, MythicAffixDef>> = {
  fortified: {
    id: 'fortified', name: 'Tahkimli', icon: ICON('fortified'), minLevel: 2,
    desc: 'Boss olmayan düşmanların canı %20, verdikleri hasar %30 artar.',
    params: { trashHpPct: 0.2, trashDmgPct: 0.3 },
  },
  tyrannical: {
    id: 'tyrannical', name: 'Zorba', icon: ICON('tyrannical'), minLevel: 2,
    desc: "Boss'ların canı %30, verdikleri hasar %15 artar.",
    params: { bossHpPct: 0.3, bossDmgPct: 0.15 },
  },
  bolstering: {
    id: 'bolstering', name: 'Güçlenen', icon: ICON('bolstering'), minLevel: 4,
    desc: 'Boss olmayan bir düşman öldüğünde, 12 m içindeki müttefikleri güçlenir (yük başına +%20 can ve hasar).',
    params: { radius: 12, hpPct: 0.2, dmgPct: 0.2, maxStacks: 10, scalePerStack: 0.03 },
  },
  raging: {
    id: 'raging', name: 'Öfkeli', icon: ICON('raging'), minLevel: 4,
    desc: 'Boss olmayan düşmanlar %30 canın altında öfkelenir: %50 fazla hasar verir, kontrol etkilerinden etkilenmez.',
    params: { hpBelow: 0.3, dmgPct: 0.5 },
  },
  sanguine: {
    id: 'sanguine', name: 'Kan Dökücü', icon: ICON('sanguine'), minLevel: 4,
    desc: 'Boss olmayan düşmanlar öldüğünde kan gölü bırakır: düşmanları iyileştirir, oyunculara hasar verir.',
    params: { radius: 4, duration: 20, healPctPerSec: 0.05, playerDmgPctPerSec: 0.03 },
  },
  bursting: {
    id: 'bursting', name: 'Patlayan', icon: ICON('bursting'), minLevel: 4,
    desc: "Boss olmayan bir düşman öldüğünde tüm oyuncular Patlama yükü alır (yük başına saniyede canın %1,5'i).",
    params: { duration: 4, dmgPctPerStackPerSec: 0.015, maxStacks: 15 },
  },
  inspiring: {
    id: 'inspiring', name: 'İlham Veren', icon: ICON('inspiring'), minLevel: 4,
    desc: 'Bazı düşmanlar çevrelerine ilham verir: yakındaki müttefikleri kontrol ve büyü kesmeye karşı bağışık olur.',
    params: { radius: 10, minPackSize: 3, every: 4 },
  },
  volcanic: {
    id: 'volcanic', name: 'Volkanik', icon: ICON('volcanic'), minLevel: 4,
    desc: 'Savaşta düşmanlardan uzak duran oyuncuların altında volkanik patlamalar oluşur.',
    params: { interval: 7, minDistance: 6, radius: 2, delay: 1.5, dmgPct: 0.25, knockup: 1.0 },
  },
  quaking: {
    id: 'quaking', name: 'Sarsıntılı', icon: ICON('quaking'), minLevel: 4,
    desc: 'Oyuncular düzenli olarak sarsıntı yayar: yakındaki herkese hasar verir ve büyülerini keser.',
    params: { interval: 20, radius: 5, delay: 2.5, dmgPct: 0.15, slotOffset: 4 },
  },
  explosive: {
    id: 'explosive', name: 'Patlayıcı Küre', icon: ICON('explosive'), minLevel: 7,
    desc: 'Savaşta düşmanların yanında patlayıcı küreler belirir. Patlamadan önce yok edin!',
    params: { interval: 8, maxOrbs: 3, castTime: 6, dmgPct: 0.35, spawnRadius: 6 },
  },
  necrotic: {
    id: 'necrotic', name: 'Nekrotik', icon: ICON('necrotic'), minLevel: 7,
    desc: 'Düşmanların yakın dövüş saldırıları birikimli Nekrotik Çürüme uygular: alınan iyileştirme azalır, zamanla hasar.',
    params: { healReducePerStack: 0.03, dotPctPerStack: 0.003, duration: 8, maxStacks: 33 },
  },
  spiteful: {
    id: 'spiteful', name: 'Kin Dolu', icon: ICON('spiteful'), minLevel: 7,
    desc: 'Boss olmayan düşmanlar öldüğünde bir Kin Ruhu belirir ve rastgele bir oyuncuyu kovalar.',
    params: { hpPctOfDead: 0.3, decayPctPerSec: 0.08, speed: 5.6, hitDmgPct: 0.08, attackCd: 1.5 },
  },
  storming: {
    id: 'storming', name: 'Fırtınalı', icon: ICON('storming'), minLevel: 7,
    desc: 'Düzenli aralıklarla oyuncuların yakınında hortumlar belirir.',
    params: { interval: 30, lifetime: 12, speed: 3.5, dmgPct: 0.15, knockup: 1.0, spawnDist: 6 },
  },
  grievous: {
    id: 'grievous', name: 'Ağır Yara', icon: ICON('grievous'), minLevel: 7,
    // Heal rule (decision): GDD_SYSTEMS 1.5 "grievous x0.5" wins over GDD_CONTENT 5.5 (damage only): while any stack is on a player,
    // healing received is halved (STATUS_RULES.grievous.healMult = 0.5, flat, not per stack). The bleed itself is dotPctPerStack.
    desc: "Canı %90'ın altındaki oyuncular birikimli Ağır Yara alır: zamanla kanar ve aldığı iyileştirme %50 azalır. %90'ın üstüne iyileşince kaybolur.",
    params: { hpBelow: 0.9, stackInterval: 3, dotPctPerStack: 0.015, maxStacks: 5 },
  },
  seasonal_efsun: {
    id: 'seasonal_efsun', name: 'Efsunlu Yarık', icon: '/assets/icons/affix-seasonal.svg', minLevel: 10,
    desc: 'Zindan güçlendikçe efsun yarıkları açılır. Muhafızı öldürürsen efsun senindir; yoksa yarık düşmanları efsunlar.',
    params: {
      t1: 0.2, t2: 0.4, t3: 0.6, t4: 0.8,
      guardianHp: 15, guardianDmg: 2, killWindow: 45, buffDuration: 60, possessHpPct: 0.3, possessDmgPct: 0.2, spawnDelay: 3,
      minDistance: 15, rootSec: 3,
    },
  },
};

/** Affix thresholds of the seasonal affix (fractions of forces). */
export const EFSUN_THRESHOLDS = [0.2, 0.4, 0.6, 0.8] as const;

/* ------------------------------------------------------------------ constants */

export const COUNTDOWN_SEC = 10;
export const DEATH_PENALTY_SEC = 15;
export const MIN_KEY_LEVEL = 2;
export const MAX_KEY_LEVEL = 30;
export const AFFIX_IDS = Object.keys(MYTHIC_AFFIXES) as AffixId[];
export const isAffixId = (id: unknown): id is AffixId => typeof id === 'string' && id in MYTHIC_AFFIXES;

/** Level at which an affix tier starts (GDD 5.5 table `from`). */
export const AFFIX_TIERS = { base: 2, slot4: 4, slot7: 7, seasonal: 10, double: 12 } as const;

/* ------------------------------------------------------------------ weekly rotation (GDD 5.6) */

export const WEEK_MS = 7 * 24 * 3600 * 1000;
/** core/utils weekIndex() counts weeks since 2024-01-01; the GDD epoch (2026-01-05) is 105 weeks later. */
export const GDD_EPOCH_WEEK = 105;

export const ROT4: AffixId[] = ['bolstering', 'raging', 'sanguine', 'bursting', 'inspiring', 'volcanic', 'quaking', 'bolstering', 'volcanic', 'raging', 'bursting', 'sanguine'];
export const ROT7: AffixId[] = ['explosive', 'spiteful', 'storming', 'explosive', 'necrotic', 'grievous', 'spiteful', 'storming', 'explosive', 'necrotic', 'spiteful', 'grievous'];

/**
 * The GDD resets Monday 01:00 UTC; core/utils weekIndex() flips at 00:00 UTC. If core shifts weekIndex by +1 h this probe notices
 * (the week index at 00:30 UTC on the epoch Monday is then -1) and weekStartMs() follows, so the two always agree.
 */
export const WEEK_RESET_OFFSET_MS = weekIndex(new Date(Date.UTC(2024, 0, 1, 0, 30))) < 0 ? 3600 * 1000 : 0;
/** Current week index in `core/utils weekIndex()` units (this is what `week` parameters mean everywhere in this module). */
export const currentWeek = (now: Date = new Date()): number => weekIndex(now);
/** 0..11 rotation slot of a week (current real-world week 2026-10-12 = rotation 4 as in the GDD table). */
export const rotationOfWeek = (week: number): number => (((week - GDD_EPOCH_WEEK) % 12) + 12) % 12;
/** Start (UTC ms) of a week index. */
export const weekStartMs = (week: number): number => Date.UTC(2024, 0, 1) + week * WEEK_MS + WEEK_RESET_OFFSET_MS;

/** Affix list for a key level in a week: [fortified|tyrannical, rot4 (+4), rot7 (+7), efsun (+10), the other base (+12)]. */
export function affixesForWeek(level: number, week: number = currentWeek()): AffixId[] {
  if (!(level >= AFFIX_TIERS.base)) return [];
  const r = rotationOfWeek(week);
  const base: AffixId = r % 2 === 0 ? 'fortified' : 'tyrannical';
  const out: AffixId[] = [base];
  if (level >= AFFIX_TIERS.slot4) out.push(ROT4[r]);
  if (level >= AFFIX_TIERS.slot7) out.push(ROT7[r]);
  if (level >= AFFIX_TIERS.seasonal) out.push('seasonal_efsun');
  if (level >= AFFIX_TIERS.double) out.push(base === 'fortified' ? 'tyrannical' : 'fortified');
  return out;
}

/* ------------------------------------------------------------------ scaling (GDD 5.4 / GDD_SYSTEMS 1.10) */

export const mplusHp = (level: number): number => 1.1 ** Math.max(0, level - 1);
export const mplusDmg = (level: number): number => 1.08 ** Math.max(0, level - 1);
/** Party HP scaling: x(1 + 0.7 (n-1)) in Mythic+, x(1 + 0.6 (n-1)) elsewhere. */
export const partyHpFactor = (n: number, mythicPlus: boolean): number => 1 + (mythicPlus ? 0.7 : 0.6) * Math.max(0, Math.min(5, n) - 1);
/** Difficulty multipliers of non-keystone modes (GDD_CONTENT 6). */
export const DIFFICULTY_MULT: Record<'normal' | 'heroic' | 'mythic', { hp: number; dmg: number }> = {
  normal: { hp: 1, dmg: 1 },
  heroic: { hp: 0.85, dmg: 0.85 },
  mythic: { hp: 1, dmg: 1 },
};
/** Affix damage given as % max HP scales by (1 + 0.03 (L - minLevel)). */
export const affixDamageScale = (keyLevel: number, minLevel: number): number => 1 + 0.03 * Math.max(0, keyLevel - minLevel);

/** monsterHP / monsterDmg at level L (GDD_SYSTEMS 1.10) for the host-computed guardian stats. */
export const monsterHP = (L: number): number => Math.round(14 + 0.62 * L * L);
export const monsterDmg = (L: number): number => Math.round(14 + 4.5 * L);

/* ------------------------------------------------------------------ timer / upgrades / loot levels */

/** +3 at <= 60% of the timer, +2 at <= 80%, +1 at <= 100%, 0 = untimed. */
export function upgradeLevelsFor(elapsedSec: number, timerSec: number): 0 | 1 | 2 | 3 {
  if (!(timerSec > 0)) return 0;
  if (elapsedSec <= timerSec * 0.6) return 3;
  if (elapsedSec <= timerSec * 0.8) return 2;
  if (elapsedSec <= timerSec) return 1;
  return 0;
}
export const chestItemLevel = (key: number, depleted = false): number => 60 + 2 * Math.min(Math.max(key, 1), 15) - (depleted ? 4 : 0);
export const vaultItemLevel = (key: number): number => 63 + 2 * Math.min(Math.max(key, 1), 15);

/* ------------------------------------------------------------------ score & rating (GDD 5.9) */

export const scoreBase = (L: number): number => 20 + 7.5 * L + 10 * (+(L >= 4) + +(L >= 7) + +(L >= 10) + +(L >= 12));
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
/** Score of one completed run. Abandoned and M0 runs score 0. */
export function computeRunScore(L: number, timeSec: number, timerSec: number): number {
  if (L < MIN_KEY_LEVEL || !(timerSec > 0)) return 0;
  const b = scoreBase(L);
  if (timeSec <= timerSec) return b + 7.5 * clamp01((timerSec - timeSec) / (0.4 * timerSec));
  return Math.max(0, b - 7.5 - 7.5 * clamp01((timeSec - timerSec) / (0.4 * timerSec)));
}
/** Per dungeon: best Tahkimli-week run F and best Zorba-week run T. */
export const dungeonScore = (F = 0, T = 0): number => 1.5 * Math.max(F, T) + 0.5 * Math.min(F, T);

export interface RatingTier { min: number; color: string; name: string }
export const RATING_TIERS: RatingTier[] = [
  { min: 0, color: '#ffffff', name: 'Acemi' },
  { min: 300, color: '#1eff00', name: 'Yetenekli' },
  { min: 700, color: '#0070dd', name: 'Usta' },
  { min: 1100, color: '#a335ee', name: 'Destansı' },
  { min: 1400, color: '#ff8000', name: 'Efsanevi' },
  { min: 1750, color: '#e6cc80', name: 'Kadim' },
];
export function ratingTier(rating: number): RatingTier {
  let t = RATING_TIERS[0];
  for (const r of RATING_TIERS) if (rating >= r.min) t = r;
  return t;
}

/* ------------------------------------------------------------------ Efsunlu Yarik guardians (GDD 5.5.4) */

export type EfsunType = 'kor' | 'ayaz' | 'golge';
export const EFSUN_ORDER: EfsunType[] = ['kor', 'ayaz', 'golge'];
export const EFSUN_INFO: Record<EfsunType, { name: string; blessing: string; color: number; unit: string; status: 'blessing_kor' | 'blessing_ayaz' | 'blessing_golge'; desc: string }> = {
  kor: { name: 'Kor', blessing: 'Kor Efsunu', color: 0xff6a00, unit: 'efsun_guardian_kor', status: 'blessing_kor', desc: '+%15 hasar, vuruşlar yakar' },
  ayaz: { name: 'Ayaz', blessing: 'Ayaz Efsunu', color: 0x6fc4ff, unit: 'efsun_guardian_ayaz', status: 'blessing_ayaz', desc: '-%15 alınan hasar, saldıranlar üşür' },
  golge: { name: 'Gölge', blessing: 'Gölge Efsunu', color: 0xa050ff, unit: 'efsun_guardian_golge', status: 'blessing_golge', desc: '+%20 hareket hızı, +%10 kritik, %10 hızlı bekleme' },
};

/* ------------------------------------------------------------------ keystone helpers / strings (GDD 5.1, 5.14) */

export const keystoneTitle = (dungeonName: string, level: number): string => `Kadim Anahtar Taşı: ${dungeonName} +${level}`;
export const mmss = (sec: number): string => {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
export const sameKey = (a: KeystoneData | null | undefined, b: KeystoneData | null | undefined): boolean =>
  !!a && !!b && a.dungeonId === b.dungeonId && a.level === b.level && !!a.depleted === !!b.depleted;

export const MPLUS_TR = {
  title: (L: number, dungeon: string) => `Mitik+ ${L} · ${dungeon}`,
  countdown: (n: number) => `Başlıyor: ${n}`,
  timer: (cur: number, max: number) => `${mmss(cur)} / ${mmss(max)}`,
  thresholds: (t2: number, t3: number) => `+2: ${mmss(t2)} · +3: ${mmss(t3)}`,
  forces: (p: number) => `Düşman Gücü: ${p.toFixed(0)}%`,
  deaths: (n: number, pen: number) => `Ölüm: ${n} (−${Math.floor(pen / 60)}:${String(Math.floor(pen % 60)).padStart(2, '0')})`,
  bossLeft: (k: number, n: number) => `Boss: ${k}/${n}`,
  timed: (n: number, dungeon2: string, L2: number) => `ZAMANINDA TAMAMLANDI! Anahtar +${n} yükseldi: ${dungeon2} +${L2}`,
  untimed: (dungeon2: string, L2: number) => `Süre doldu. Anahtar 1 seviye düştü: ${dungeon2} +${L2}`,
  abandoned: 'Koşu terk edildi. Anahtar 1 seviye düştü.',
  score: (r: number, d: number) => `Mitik+ Puanı: ${r.toFixed(1)} (${d >= 0 ? '+' : ''}${d.toFixed(1)})`,
  newKey: (dungeon: string, L: number) => `Kadim Anahtar Taşı kazandın: ${dungeon} +${L}!`,
  riftOpen: 'Bir Efsun Yarığı açıldı!',
  riftFail: 'Yarık Muhafızı bir sürüyü efsunladı!',
  riftWin: (blessing: string) => `${blessing} kazandın! (60 sn)`,
  orbWarn: 'Patlayıcı Küre belirdi!',
  stormWarn: 'Bir hortum belirdi!',
  bannerTimed: (n: number, cur: number, max: number, deaths: number) => `Zamanında: +${n} · ${mmss(cur)} / ${mmss(max)} · Ölüm: ${deaths}`,
  bannerUntimed: (cur: number, max: number, deaths: number) => `Süre aşıldı · ${mmss(cur)} / ${mmss(max)} · Ölüm: ${deaths}`,
  vault: (runs: number, opts: number[]) => `Kadim Kasa: ${runs}/8 koşu · ${opts.length} seçenek açık${opts.length ? ` (${opts.join(', ')} eşya seviyesi)` : ''}`,
} as const;
