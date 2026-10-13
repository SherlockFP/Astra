import { G } from '../game/G';
import { toast } from './notify';
import { RNG, hashString } from '../core/utils';
import { bountyDayKey } from './Bounties';
import { DUNGEONS, DUNGEON_IDS, getDungeon } from '../data/dungeons';
import { TILE_SIZE, type VillageDef } from '../types/dungeons';
import type { CharacterSave, DailySave } from '../types/character';
import type { CharacterState } from './CharacterState';
import type { RunState } from '../types/mythic';
import { bump, feed as achievementFeed, raise } from './Achievements';

/**
 * WP-10 daily loop (docs/MMO_PILLARS.md). OWNER: items/progression module.
 *  - daily login streak with small gold rewards (a missed day resets the streak to 1);
 *  - rested XP: accrues logged out and while resting in a town or a village box; kills give bonus XP from the pool
 *    (x2 until it is used up), the pool holds at most 1.5 levels; quest XP is never boosted;
 *  - 6 rotating world quests per open-world zone (Sisli Vadi, Karakır), chosen from the bounty day key;
 *  - "Günün Zindanı": one random levelling dungeon per day, its first clear pays the rewards twice.
 * The pure functions at the top are driven by dev/combat-sim/daily.mjs. `installDailyLoop()` wires them to the game.
 * Progress of the day lives in `CharacterSave.flags` (`wq.<day>.<zone>.<id>`, `gd.<day>.done`) and is pruned on day change.
 */

const HOUR_MS = 3600_000;
const TICK_MS = 30_000;

/** Rested XP: 5 % of the level's XP requirement per 8 hours of rest (the WoW rate). */
export const REST_PER_HOUR = 0.05 / 8;
/** The rested pool holds at most 1.5 levels of XP. */
export const REST_CAP_LEVELS = 1.5;
/** Open-world zones with the daily world quests (Kızıl Sınır is PvP and has none). */
export const WORLD_QUEST_ZONES: readonly string[] = ['sisli_vadi', 'karakir_bozkiri'];
export const WORLD_QUESTS_PER_ZONE = 6;
/** The login reward cycle: day 7 pays the extra Av Mührü. */
export const LOGIN_CYCLE = 7;

export type WorldQuestKind = 'kill' | 'elite' | 'boss' | 'metin' | 'gold';

export interface WorldQuestDef {
  id: string;
  title: string;
  /** Which event counts toward it (see worldQuestEvent). */
  kind: WorldQuestKind;
  target: number;
  desc: (n: number) => string;
}

/** Pool of the world quests. Ids are stored in saves: never rename or reuse one. */
export const WORLD_QUEST_POOL: WorldQuestDef[] = [
  { id: 'wq_kill40', title: 'Yaban Avı', kind: 'kill', target: 40, desc: (n) => `${n} canavar öldür.` },
  { id: 'wq_kill90', title: 'Kır Temizliği', kind: 'kill', target: 90, desc: (n) => `${n} canavar öldür.` },
  { id: 'wq_elite1', title: 'Ara Patron Avı', kind: 'elite', target: 1, desc: (n) => `${n} Seçkin ya da Ara Patron yen.` },
  { id: 'wq_elite4', title: 'Seçkin Peşinde', kind: 'elite', target: 4, desc: (n) => `${n} Seçkin ya da Ara Patron yen.` },
  { id: 'wq_boss1', title: 'Patron Kovalayıcı', kind: 'boss', target: 1, desc: (n) => `${n} patron öldür.` },
  { id: 'wq_metin3', title: 'Metin Kırıcı', kind: 'metin', target: 3, desc: (n) => `${n} Metin yık.` },
  { id: 'wq_metin6', title: 'Taş Tozu', kind: 'metin', target: 6, desc: (n) => `${n} Metin yık.` },
  { id: 'wq_gold8000', title: 'Yol Parası', kind: 'gold', target: 8000, desc: (n) => `Bölgede ${n.toLocaleString('tr-TR')} altın kazan.` },
  { id: 'wq_gold25000', title: 'Hazine Peşinde', kind: 'gold', target: 25000, desc: (n) => `Bölgede ${n.toLocaleString('tr-TR')} altın kazan.` },
  { id: 'wq_elite8', title: 'Seçkin Kovalayıcı', kind: 'elite', target: 8, desc: (n) => `${n} Seçkin ya da Ara Patron yen.` },
];

// ---------------------------------------------------------------------------------------------- day keys (pure)

/** Day key (YYYYMMDD) `days` days away from `key`. */
export function shiftDayKey(key: number, days: number): number {
  const y = Math.floor(key / 10000), m = Math.floor(key / 100) % 100, d = key % 100;
  const u = new Date(Date.UTC(y, m - 1, d + days));
  return u.getUTCFullYear() * 10000 + (u.getUTCMonth() + 1) * 100 + u.getUTCDate();
}

/** Removes the day-scoped flags (wq.*, gd.*) of every other day. */
export function pruneDayFlags(flags: CharacterSave['flags'], day: number): void {
  for (const k of Object.keys(flags)) {
    if (!k.startsWith('wq.') && !k.startsWith('gd.')) continue;
    const d = Number(k.split('.')[1]);
    if (d && d !== day) delete flags[k];
  }
}

// ---------------------------------------------------------------------------------------------- login streak (pure)

/** Streak after a login on `today`. Same day: unchanged. Yesterday counted: +1. Any missed day: starts again at 1. */
export function loginStep(d: Pick<DailySave, 'streak' | 'streakDay'>, today: number): { streak: number; fresh: boolean } {
  if (d.streakDay === today && d.streak > 0) return { streak: d.streak, fresh: false };
  const continues = d.streak > 0 && d.streakDay === shiftDayKey(today, -1);
  return { streak: continues ? d.streak + 1 : 1, fresh: true };
}

/** Gold and Av Mührü of a login. Gold is 25 x level x the day of the 7-day cycle (day 1 small, day 7 the biggest). */
export function loginReward(streak: number, level: number): { gold: number; muhru: number } {
  const day = ((Math.max(1, streak) - 1) % LOGIN_CYCLE) + 1;
  return { gold: 25 * Math.max(1, level) * day, muhru: day === LOGIN_CYCLE ? 2 : 0 };
}

// ---------------------------------------------------------------------------------------------- rested XP (pure)

/** Pool cap in XP for a level whose requirement is `xpNeed` (0 at the level cap, where xpNeed is Infinity). */
export function restedCap(xpNeed: number): number {
  return Number.isFinite(xpNeed) && xpNeed > 0 ? REST_CAP_LEVELS * xpNeed : 0;
}

/**
 * One accrual tick. `resting` (logged out, or in a town / village box) adds the time since the last tick at REST_PER_HOUR.
 * Returns the XP gained. The tick time always moves to `now`, so time in the field is never counted later.
 */
export function accrueRested(d: Pick<DailySave, 'rested' | 'restedAt'>, now: number, resting: boolean, xpNeed: number): number {
  let gained = 0;
  const last = d.restedAt > 0 ? d.restedAt : now;
  if (resting && now > last && Number.isFinite(xpNeed) && xpNeed > 0) {
    const cap = restedCap(xpNeed);
    const next = Math.min(cap, d.rested + ((now - last) / HOUR_MS) * REST_PER_HOUR * xpNeed);
    gained = Math.max(0, next - d.rested);
    d.rested = Math.max(d.rested, next);
  }
  d.restedAt = now;
  return gained;
}

/** Bonus XP of one kill worth `base` XP: doubled while the pool lasts, the pool pays it out. Returns the bonus. */
export function consumeRested(d: Pick<DailySave, 'rested'>, base: number): number {
  if (!(base > 0) || !(d.rested > 0)) return 0;
  const bonus = Math.min(base, d.rested);
  d.rested -= bonus;
  return bonus;
}

// ---------------------------------------------------------------------------------------------- world quests (pure)

/** The `count` world quests of a zone on a day key: a seeded shuffle of the pool, so every client picks the same ones. */
export function pickWorldQuests(zone: string, day: number): WorldQuestDef[] {
  const rng = new RNG(hashString(`worldq:${zone}:${day}`));
  return rng.shuffle([...WORLD_QUEST_POOL]).slice(0, WORLD_QUESTS_PER_ZONE);
}

const wqKey = (day: number, zone: string, id: string) => `wq.${day}.${zone}.${id}`;

/** Progress of one world quest on `day` read from the flags (capped at its target). */
export function worldQuestProgress(flags: CharacterSave['flags'], zone: string, day: number, def: WorldQuestDef): number {
  return Math.min(def.target, Number(flags[wqKey(day, zone, def.id)] ?? 0) || 0);
}

/** The board of a zone: each picked quest with its progress. */
export function worldQuestBoard(flags: CharacterSave['flags'], zone: string, day: number): { def: WorldQuestDef; progress: number; done: boolean }[] {
  return pickWorldQuests(zone, day).map((def) => {
    const progress = worldQuestProgress(flags, zone, day, def);
    return { def, progress, done: progress >= def.target };
  });
}

// ---------------------------------------------------------------------------------------------- daily dungeon (pure)

/**
 * "Günün Zindanı": one levelling dungeon for the day, drawn from the dungeons the level reaches (a level-band margin of 10 above
 * the top of the range). Null below level 8, where no levelling dungeon is open yet.
 */
export function pickDailyDungeon(day: number, level: number): string | null {
  const eligible = DUNGEON_IDS.filter((id) => {
    const r = DUNGEONS[id]?.levelRange;
    return !!r && r[0] <= level && level <= r[1] + 10;
  });
  if (!eligible.length) return null;
  return new RNG(hashString(`gd:${day}`)).pick(eligible);
}

// ---------------------------------------------------------------------------------------------- villages (pure)

/** True inside a village safe box (the same box SafeZones uses: the explicit `safe` half sizes, else the walled bounds). */
export function inVillageBox(villages: readonly VillageDef[], x: number, z: number): boolean {
  for (const v of villages) {
    const cx = (v.center[0] + 0.5) * TILE_SIZE, cz = (v.center[1] + 0.5) * TILE_SIZE;
    const hx = v.safe?.halfX ?? v.bounds[0], hz = v.safe?.halfZ ?? v.bounds[1];
    if (Math.abs(x - cx) <= hx && Math.abs(z - cz) <= hz) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------------------------- game wiring

/** The daily block of a save, created on first use. */
export function dailySave(save: CharacterSave): DailySave {
  const d = (save.daily ??= { rested: 0, restedAt: 0, streak: 0, streakDay: 0 });
  if (!Number.isFinite(d.rested) || d.rested < 0) d.rested = 0;
  if (!Number.isFinite(d.restedAt)) d.restedAt = 0;
  if (!Number.isFinite(d.streak)) d.streak = 0;
  if (!Number.isFinite(d.streakDay)) d.streakDay = 0;
  return d;
}

/** Rested pool of a save, clamped to the cap of the current level (the HUD shows this). */
export function restedPool(save: CharacterSave, xpNeed: number): number {
  const d = save.daily;
  if (!d) return 0;
  return Math.min(Math.max(0, d.rested), restedCap(xpNeed));
}

/** Bonus XP for a kill worth `base` XP, taken from the local character's rested pool. Used by LootSystem. */
export function restedKillBonus(base: number): number {
  const ch = G.character;
  if (!ch) return 0;
  return Math.round(consumeRested(dailySave(ch.save), base));
}

/** Zone id of the open-world map the local player is in, when it has daily world quests. */
export function worldZoneNow(): string | null {
  if (G.scenes?.current?.id !== 'dungeon') return null;
  const id = G.mplus?.params?.dungeonId ?? G.mplus?.state?.dungeonId ?? null;
  return id && WORLD_QUEST_ZONES.includes(id) ? id : null;
}

/** Rested XP accrues in the town, and in a village box of the open-world zone the player stands in. */
function restingNow(): boolean {
  if (G.scenes?.current?.id === 'town') return true;
  const zone = worldZoneNow();
  const p = G.player;
  if (!zone || !p) return false;
  return inVillageBox(getDungeon(zone)?.world?.villages ?? [], p.position.x, p.position.z);
}

/** Counts a world quest event (kill, elite, boss, metin, gold) in the open-world zone the player is in. */
export function worldQuestEvent(kind: WorldQuestKind, amount = 1): void {
  const ch = G.character;
  const zone = worldZoneNow();
  if (!ch || !zone || !(amount > 0)) return;
  const day = bountyDayKey();
  pruneDayFlags(ch.save.flags, day);
  let changed = false;
  for (const def of pickWorldQuests(zone, day)) {
    if (def.kind !== kind) continue;
    const key = wqKey(day, zone, def.id);
    const cur = Number(ch.save.flags[key] ?? 0) || 0;
    if (cur >= def.target) continue;
    const next = Math.min(def.target, cur + amount);
    ch.save.flags[key] = next;
    changed = true;
    if (next >= def.target) completeWorldQuest(def);
  }
  if (changed) {
    G.events.emit('bounty:changed', {});
    ch.persist();
  }
}

/** True while a reward is being paid: its gold must not count toward the gold world quests (player:gold re-enters). */
let rewarding = false;
function grantGold(ch: CharacterState, amount: number): void {
  rewarding = true;
  try {
    ch.addGold(amount);
  } finally {
    rewarding = false;
  }
}

function completeWorldQuest(def: WorldQuestDef): void {
  const ch = G.character;
  if (!ch) return;
  // quest XP (a tenth of the level's requirement): it is not boosted by rested XP
  const need = G.progression.xpToNext(ch.level);
  if (Number.isFinite(need)) G.progression.addXp(Math.round(0.1 * need));
  grantGold(ch, 150 * ch.level);
  ch.addMaterial('av_muhru', 2);
  toast(`Dünya görevi tamamlandı: ${def.title}`, 'success');
  achievementFeed((s) => bump(s, 'worldQuests'));
}

/** Today's daily dungeon of the local character and whether its double reward is taken. */
export function dailyDungeonToday(): { id: string; done: boolean } | null {
  const ch = G.character;
  if (!ch) return null;
  const day = bountyDayKey();
  const id = pickDailyDungeon(day, ch.level);
  return id ? { id, done: ch.save.flags[`gd.${day}.done`] === true } : null;
}

/** A finished run: the first clear of today's daily dungeon pays a second end-of-run roll (items to the bag, gold and materials again). */
function onRunCompleted(state: RunState): void {
  const ch = G.character;
  if (!ch || !state || state.failed || !state.completed) return;
  const day = bountyDayKey();
  if (state.dungeonId !== pickDailyDungeon(day, ch.level)) return;
  const key = `gd.${day}.done`;
  if (ch.save.flags[key] === true) return;
  ch.save.flags[key] = true;
  pruneDayFlags(ch.save.flags, day);
  const extra = G.loot?.endOfRunRewards(state) ?? [];
  for (const it of extra) if (!ch.addItem(it) && G.player) G.loot.dropItem(it, G.player.position);
  achievementFeed((s) => bump(s, 'dailyDungeons'));
  toast(`Günün Zindanı tamamlandı: ${DUNGEONS[state.dungeonId]?.name ?? state.dungeonId} ödülleri x2!`, 'loot');
  G.events.emit('bounty:changed', {});
  ch.persist();
}

/** First scene of a character in this session: accrues the logged-out rest, counts the login day and pays the login reward. */
function onLogin(ch: CharacterState): void {
  const now = Date.now();
  const d = dailySave(ch.save);
  accrueRested(d, now, true, G.progression.xpToNext(ch.level));
  const today = bountyDayKey(new Date(now));
  const step = loginStep(d, today);
  if (!step.fresh) return;
  d.streak = step.streak;
  d.streakDay = today;
  const r = loginReward(step.streak, ch.level);
  if (r.gold) grantGold(ch, r.gold);
  if (r.muhru) ch.addMaterial('av_muhru', r.muhru);
  achievementFeed((s) => raise(s, 'loginStreak', step.streak));
  toast(`Günlük giriş: ${step.streak}. gün · +${r.gold.toLocaleString('tr-TR')} altın${r.muhru ? ` · +${r.muhru} Av Mührü` : ''}`, 'success');
  ch.persist();
}

/** The kill that counts for the world quests: enemies only (not Metin stones or mechanic units). */
function onDeath(entityId: number, killerId: number | null): void {
  if (!G.player || killerId !== G.player.id) return;
  const def = (G.world?.entities.get(entityId) as { def?: { id?: string; rank?: string } } | undefined)?.def;
  if (!def) return;
  const id = def.id ?? '';
  if (id.startsWith('proc_')) return;
  if (id.startsWith('metin_')) {
    worldQuestEvent('metin');
    return;
  }
  worldQuestEvent('kill');
  if (def.rank === 'elite' || def.rank === 'miniboss') worldQuestEvent('elite');
  if (def.rank === 'boss') worldQuestEvent('boss');
}

/**
 * Subscribes the daily loop to the game (LOCAL character only) and ticks the rested pool every 30 s. Returns the disposer.
 * Called once from game/Game.ts createServices(), next to installAchievements().
 */
export function installDailyLoop(): () => void {
  const ev = G.events;
  if (!ev) return () => {};
  let session: string | null = null;
  const tick = (): void => {
    const ch = G.character;
    if (!ch || ch.save.id !== session) return;
    accrueRested(dailySave(ch.save), Date.now(), restingNow(), G.progression.xpToNext(ch.level));
  };
  const timer = setInterval(() => {
    try {
      tick();
    } catch (e) {
      console.warn('[daily] rested tick failed', e);
    }
  }, TICK_MS);
  const offs: (() => void)[] = [
    ev.on('scene:changed', () => {
      const ch = G.character;
      if (!ch) {
        session = null; // back in the menu: the next entry counts as a login (logged-out rest)
        return;
      }
      if (session === ch.save.id) return;
      session = ch.save.id;
      try {
        onLogin(ch);
      } catch (e) {
        console.warn('[daily] login failed', e);
      }
    }),
    ev.on('death', ({ entityId, killerId }) => onDeath(entityId, killerId)),
    ev.on('player:gold', ({ delta }) => {
      if (delta > 0 && !rewarding) worldQuestEvent('gold', delta);
    }),
    ev.on('run:completed', ({ state }) => onRunCompleted(state)),
  ];
  return () => {
    clearInterval(timer);
    for (const off of offs) off();
    session = null;
  };
}
