import { G } from '../../../game/G';
import type { ArenaBracket } from '../../../types/finder';
import { ARENA_MIN_LEVEL, PVP_SEASON_WEEKS, arenaTitleName, seasonOfWeek, tierOf, weekInSeason, type ArenaTier } from '../../../scenes/arena/arenaRules';
import { currentWeek, weekStartMs } from '../../../data/mythicAffixes';
import { ARENA_TEAM_SIZE } from '../../../net/queue/matcher';

/**
 * Shared pieces of the arena UI (GDD_PVP_FINDER §2.5 Oyuncuya Karşı tab, §5.3 queue bar, §5.4 strings, §5.5 arena HUD, Sıralama panel).
 * Pure helpers over `G` (no DOM): the Turkish strings, the bracket names, the season clock, the queue entry gate and the tier view.
 * The queue and the ladder are read through `G.net.queue` / `G.arenaLadder` only (the arena core APIs).
 */

export const ARENA_TR = {
  duel: 'Düello Pratiği (1v1)',
  arena2v2: '2v2 Arena',
  arena3v3: '3v3 Arena',
  short: { '1v1': 'Düello', '2v2': '2v2', '3v3': '3v3' } as Record<ArenaBracket, string>,
  ranked: 'Dereceli',
  unranked: 'Derecesiz',
  rating: 'Puanın',
  season: 'Sezon {n} · Hafta {k}/8',
  seasonLeft: 'Sezonun bitmesine',
  onur: 'Onur',
  onurToday: 'bugün',
  fetih: 'Fetih',
  fetihWeek: 'bu hafta',
  dampRule: 'Yıpranma: 120 sn sonra başlar, dakikada %8 iyileşme azalır.',
  range: 'Puan aralığı',
  enter: 'Kuyruğa Gir',
  leave: 'Kuyruktan Çık',
  cancelQueue: 'Kuyruğu İptal Et',
  inQueue: 'Kuyrukta',
  searching: 'Rakip aranıyor',
  proposed: 'Eşleşme hazırlanıyor…',
  found: 'Grup bulundu! Odaya bağlanılıyor…',
  inMatch: 'Arena maçı sürüyor',
  estWait: 'Tahmini bekleme',
  pool: 'Havuzda',
  reqLevel: 'Seviye {n}+',
  reqTown: 'Kasabada olmalısın',
  reqSolo: 'Grupta değilsin',
  reqGear: 'PvE eşyan arenada %60 değerinde sayılır; PvP eşyası şart değil.',
  alreadyIn: 'Zaten bir kuyruktasın.',
  notTown: 'Kuyruğa girmek için kasabada olmalısın.',
  inParty: 'Bir grubun içindeyken kuyruğa giremezsin.',
  notChar: 'Önce bir karakter seçmelisin.',
  cooldown: (min: number) => `Maçtan ayrıldığın için ${min} dk kuyruğa giremezsin.`,
  matchFoundAccept: 'Kabul',
  matchFoundDecline: 'Reddet',
  matchFoundTitle: 'MAÇ BULUNDU',
  matchFoundText: 'Rakip takım hazır. Odaya katılmak için kabul et.',
  secLeft: (s: number) => `${s} sn`,
  won: 'Kazandın!',
  lost: 'Kaybettin',
  draw: 'Maç berabere',
  exitBtn: 'Arenadan Çık',
  exitIn: (s: number) => `${s} sn sonra kasabaya dönülür`,
  rankBtn: 'Sıralama',
  rankTitle: 'Sıralama',
  rankNext: 'Sonraki kademe',
  rankTop: 'En üst kademedesin.',
  rankPlace: 'Sıralamadaki yerin',
  rankHistory: 'Sezon geçmişi',
  rankBest: 'en iyi',
  rankSeasonPeak: 'Bu sezon en yüksek',
  rankNoHistory: 'Henüz tamamlanmış sezon yok.',
  rankOnline: 'Çevrimiçi oyuncuların puanları henüz yayınlanmıyor.',
  titles: 'Unvanlar',
  noTitles: 'Henüz arena unvanın yok.',
  reqFail: 'Kuyruğa girmek için şartları karşıla.',
  tierChange: (a: string, b: string) => `Kademe: ${a} → ${b}`,
  delta: (d: number) => (d > 0 ? `+${d}` : `${d}`),
  rewards: (onur: number, fetih: number) => `+${onur} Onur · +${fetih} Fetih`,
  prep: (s: number) => `Kapılar ${s} sn sonra açılır`,
  round: (n: number) => `Tur ${n}/3`,
  score: (a: number, b: number) => `Kızıl ${a} — ${b} Mavi`,
  damp: (p: number) => `Yıpranma %${p}`,
  dead: 'düştü',
  team: { A: 'Kızıl', B: 'Mavi' } as Record<'A' | 'B', string>,
} as const;

export const TIER_TONE: Record<string, string> = {
  acemi: '#9d9d9d',
  savasci: '#1eff00',
  rakip: '#0070dd',
  duellocu: '#a335ee',
  gladyator: '#ff8000',
  sampiyon: '#e6cc80',
  kadim: '#f48cba',
};

/** Two-digit clock for mm:ss. */
export function clockText(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** Long text for the season clock: "3 g 4 sa", "5 sa 10 dk", "12 dk". */
export function timeLeftText(ms: number): string {
  const d = Math.floor(ms / 86400000);
  const hh = Math.floor((ms % 86400000) / 3600000);
  const mm = Math.floor((ms % 3600000) / 60000);
  if (d > 0) return `${d} g ${hh} sa`;
  if (hh > 0) return `${hh} sa ${mm} dk`;
  return `${Math.max(0, mm)} dk`;
}

export interface SeasonView { n: number; week: number; left: string; leftMs: number }

/** Season number (1-based), week in season and the time until the season ends (the next season's first week start). */
export function seasonView(now: number = Date.now()): SeasonView {
  const week = currentWeek();
  const idx = seasonOfWeek(week);
  const endMs = weekStartMs((idx + 1) * PVP_SEASON_WEEKS);
  const leftMs = Math.max(0, endMs - now);
  return { n: idx + 1, week: weekInSeason(week), left: timeLeftText(leftMs), leftMs };
}

export function seasonLine(v: SeasonView): string {
  return ARENA_TR.season.replace('{n}', String(v.n)).replace('{k}', String(v.week));
}

/** Visible bracket rating (1500 start) from the ladder. */
export function ratingOf(b: ArenaBracket): number {
  return G.arenaLadder?.rating(b) ?? 1500;
}

/** Tier of a rating, with the next tier and the points left to it. */
export function tierView(rating: number): ArenaTier & { index: number; next: ArenaTier | null; toNext: number } {
  return tierOf(rating);
}

/** Tier name list for the ladder table (Acemi .. Kadim Savaşçı), from arenaRules. */
export const bracketName = (b: ArenaBracket): string => (b === '1v1' ? ARENA_TR.duel : b === '2v2' ? ARENA_TR.arena2v2 : ARENA_TR.arena3v3);

export function titleNames(): string[] {
  const titles = G.character?.save.titles ?? [];
  const out: string[] = [];
  for (const id of titles) {
    const n = arenaTitleName(id);
    if (n) out.push(n);
  }
  return out;
}

export interface EnterGate { ok: boolean; reason: string }

/** Why the local player cannot queue right now (mirrors QueueService.enter, so the buttons can say it before the click). */
export function enterGate(): EnterGate {
  const ch = G.character;
  if (!ch) return { ok: false, reason: ARENA_TR.notChar };
  if (ch.level < ARENA_MIN_LEVEL) return { ok: false, reason: `Arena için en az ${ARENA_MIN_LEVEL}. seviye olmalısın.` };
  if (G.scenes?.current?.id !== 'town') return { ok: false, reason: ARENA_TR.notTown };
  if (G.net?.inParty) return { ok: false, reason: ARENA_TR.inParty };
  const st = G.net?.queue?.state();
  if (st && st.phase !== 'idle') return { ok: false, reason: ARENA_TR.alreadyIn };
  const rem = G.arenaLadder?.lockRemainingMs() ?? 0;
  if (rem > 0) return { ok: false, reason: ARENA_TR.cooldown(Math.ceil(rem / 60000)) };
  return { ok: true, reason: '' };
}

/** Estimated wait in seconds. Heuristic: a match needs 2 x team-size queuers of the same key; each missing one costs ~20 s. */
export function estimatedWaitSec(b: ArenaBracket, pool: number): number {
  const need = ARENA_TEAM_SIZE[b] * 2;
  const missing = Math.max(0, need - pool);
  return missing === 0 ? 5 : Math.min(300, missing * 20);
}
