import { G } from '../game/G';
import { toast } from './notify';
import { RNG, hashString } from '../core/utils';
import type { ItemInstance } from '../types/items';
import { gemId, GEM_TYPES } from '../data/materials';

/** Daily bounties ("Günlük Görevler") from the town bounty board. OWNER: items/progression module. */
export interface Bounty {
  id: string;
  title: string;                // Turkish
  desc: string;
  kind: 'kill' | 'kill_elite' | 'boss' | 'dungeon' | 'mplus' | 'gold' | 'upgrade' | 'salvage' | 'globe' | 'party' | 'elite_nodeath' | 'metin' | 'rare' | 'farm';
  target: number;
  progress: number;
  reward: { xp?: number; gold?: number; materials?: { id: string; count: number }[] };
  claimed: boolean;
  /** items module extras */
  icon?: string;
  /** Mythic+ bounty that only counts timed runs. */
  timedOnly?: boolean;
  /** progress >= target */
  done?: boolean;
}

interface Template {
  id: string;
  title: string;
  desc: (n: number) => string;
  kind: Bounty['kind'];
  target: (level: number) => number;
  minLevel: number;
  maxLevel?: number;
  timedOnly?: boolean;
  /** Only counts enemies within +-5 levels of the character (open world targets). */
  band?: boolean;
  icon: string;
}

const ic = (n: string) => `/assets/icons/${n}.svg`;
export const BOUNTY_TEMPLATES: Template[] = [
  { id: 'bounty_kill', title: 'Canavar Avı', desc: (n) => `${n} canavar öldür.`, kind: 'kill', target: (l) => Math.min(60, 25 + l), minLevel: 1, icon: ic('skill-sword-slash') },
  { id: 'bounty_kill_elites', title: 'Seçkin Avcısı', desc: (n) => `${n} Seçkin düşmanı yen.`, kind: 'kill_elite', target: () => 8, minLevel: 3, icon: ic('skill-double-strike') },
  { id: 'bounty_kill_boss', title: 'Patron Avı', desc: (n) => `${n} patron öldür.`, kind: 'boss', target: () => 2, minLevel: 8, icon: ic('item-boss-key') },
  { id: 'bounty_dungeon', title: 'Zindan Temizliği', desc: (n) => `${n} zindanı tamamla.`, kind: 'dungeon', target: () => 1, minLevel: 8, icon: ic('item-skeleton-key') },
  { id: 'bounty_mplus', title: 'Kadim Sınav', desc: (n) => `${n} Mitik+ anahtarını tamamla.`, kind: 'mplus', target: () => 1, minLevel: 60, icon: ic('item-keystone') },
  { id: 'bounty_mplus_timed', title: 'Zamana Karşı', desc: (n) => `${n} Mitik+ anahtarını süresi içinde bitir.`, kind: 'mplus', target: () => 1, minLevel: 60, timedOnly: true, icon: ic('item-keystone') },
  { id: 'bounty_upgrade', title: 'Demircinin Çırağı', desc: (n) => `Demirci'de ${n} başarılı yükseltme yap.`, kind: 'upgrade', target: () => 3, minLevel: 5, icon: ic('item-upgrade-stone') },
  { id: 'bounty_salvage', title: 'Hurdacı', desc: (n) => `${n} eşyayı parçala.`, kind: 'salvage', target: () => 15, minLevel: 5, icon: ic('item-ore') },
  { id: 'bounty_gold', title: 'Hazine Avcısı', desc: (n) => `${n.toLocaleString('tr-TR')} altın topla.`, kind: 'gold', target: (l) => 1000 * l, minLevel: 3, icon: ic('item-gold-coins') },
  { id: 'bounty_globe', title: 'Hayatta Kal', desc: (n) => `${n} Can Küresi topla.`, kind: 'globe', target: () => 25, minLevel: 3, icon: ic('item-potion-health') },
  { id: 'bounty_party', title: 'Yoldaşlık', desc: (n) => `${n} canavarı bir grupla birlikte öldür.`, kind: 'party', target: () => 150, minLevel: 8, icon: ic('item-chalice') },
  { id: 'bounty_no_death', title: 'Ölümsüz', desc: (n) => `Ölmeden ${n} Seçkin düşmanı yen (ölürsen sayaç sıfırlanır).`, kind: 'elite_nodeath', target: () => 3, minLevel: 5, icon: ic('buff-invulnerable') },
  // open world (GDD_OPENWORLD 6.5): the band is the character level +-5
  { id: 'bounty_metin', title: 'Metin Avı', desc: (n) => `Seviye bandında ${n} Metin yık.`, kind: 'metin', target: () => 2, minLevel: 5, band: true, icon: ic('item-crystal-shard') },
  { id: 'bounty_rare', title: 'Nadir Avcısı', desc: (n) => `Seviye bandında ${n} nadir yaratık öldür.`, kind: 'rare', target: () => 1, minLevel: 4, band: true, icon: ic('ui-medal') },
  { id: 'bounty_farm', title: 'Kamp Temizliği', desc: (n) => `Seviye bandında ${n} kampı tamamen temizle.`, kind: 'farm', target: () => 3, minLevel: 3, band: true, icon: ic('skill-sword-slash') },
];

/** Local 04:00 reset: the "bounty day" index (YYYYMMDD of now - 4h). */
export function bountyDayKey(date = new Date()): number {
  const d = new Date(date.getTime() - 4 * 3600 * 1000);
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}
const progKey = (day: number, id: string) => `bounty.${day}.${id}`;

function pruneOld(day: number): void {
  const flags = G.character?.save.flags;
  if (!flags) return;
  for (const k of Object.keys(flags)) {
    if (!k.startsWith('bounty.')) continue;
    const d = Number(k.split('.')[1]);
    if (d && d !== day) delete flags[k];
  }
}

/** Templates picked for a day and character level (deterministic by date). */
export function pickDailyTemplates(day: number, level: number, reroll = 0): Template[] {
  const pool = BOUNTY_TEMPLATES.filter((t) => level >= t.minLevel && (t.maxLevel === undefined || level <= t.maxLevel));
  const rng = new RNG(hashString(`bounty:${day}:${reroll}`));
  const picked: Template[] = [];
  const bag = rng.shuffle([...pool]);
  for (const t of bag) {
    if (picked.length >= 3) break;
    // keep at most one Mythic+ bounty
    if (t.kind === 'mplus' && picked.some((p) => p.kind === 'mplus')) continue;
    picked.push(t);
  }
  return picked;
}

function rewardFor(level: number): Bounty['reward'] {
  const prog = G.progression;
  const xp = level < 60 && prog ? Math.round(0.15 * prog.xpToNext(level)) : 0;
  return { xp: xp || undefined, gold: 100 * level, materials: [{ id: 'av_muhru', count: level >= 60 ? 8 : 5 }] };
}

/** Today's bounties for the local character (seeded by date; progress stored in save.flags). */
export function dailyBounties(): Bounty[] {
  const ch = G.character;
  if (!ch) return [];
  const day = bountyDayKey();
  pruneOld(day);
  const level = ch.level;
  const reroll = Number(ch.save.flags[`bounty.${day}.reroll`] ?? 0);
  const templates = pickDailyTemplates(day, level, reroll);
  return templates.map((t) => {
    const target = t.target(level);
    const progress = Math.min(target, Number(ch.save.flags[progKey(day, t.id)] ?? 0));
    const claimed = ch.save.flags[progKey(day, t.id) + '.claimed'] === true;
    return {
      id: t.id, title: t.title, desc: t.desc(target), kind: t.kind, target, progress, reward: rewardFor(level), claimed, icon: t.icon,
      timedOnly: t.timedOnly, done: progress >= target,
    };
  });
}

export function claimBounty(id: string): boolean {
  const ch = G.character;
  if (!ch) return false;
  const day = bountyDayKey();
  const b = dailyBounties().find((x) => x.id === id);
  if (!b || b.claimed || b.progress < b.target) return false;
  ch.save.flags[progKey(day, id) + '.claimed'] = true;
  const r = b.reward;
  if (r.gold) ch.addGold(r.gold);
  for (const m of r.materials ?? []) ch.addMaterial(m.id, m.count);
  if (r.xp) G.progression?.addXp(r.xp);
  // weekly decree counter (Haftalık Ferman)
  const wk = bountyWeekKey();
  pruneWeekly(wk);
  const wkey = `bounty.week.${wk}.count`;
  ch.save.flags[wkey] = Number(ch.save.flags[wkey] ?? 0) + 1;
  G.events.emit('bounty:changed', {});
  toast(`Görev ödülü alındı: ${b.title}`, 'success');
  if (Number(ch.save.flags[wkey]) === WEEKLY_TARGET) toast('Haftalık Ferman hazır! Görev Panosu\'ndan al.', 'levelup');
  ch.persist();
  return true;
}

// ============================================================================ weekly decree (Haftalık Ferman)
export const WEEKLY_TARGET = 12;
/** Local Monday 04:00 reset: index of the bounty week (weeks since 2024-01-01). */
export function bountyWeekKey(date = new Date()): number {
  const d = new Date(date.getTime() - 4 * 3600 * 1000);
  const days = Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(2024, 0, 1)) / 86400000);
  return Math.floor(days / 7);
}
function pruneWeekly(week: number): void {
  const flags = G.character?.save.flags;
  if (!flags) return;
  for (const k of Object.keys(flags)) if (k.startsWith('bounty.week.') && Number(k.split('.')[2]) !== week) delete flags[k];
}
/** Progress of the weekly decree: 12 claimed dailies in a week -> 1 Destansı item + 30 Av Mührü + 1 Efsun Kilidi. */
export function weeklyDecree(): { count: number; target: number; claimed: boolean; ready: boolean } {
  const ch = G.character;
  if (!ch) return { count: 0, target: WEEKLY_TARGET, claimed: false, ready: false };
  const wk = bountyWeekKey();
  pruneWeekly(wk);
  const count = Math.min(WEEKLY_TARGET, Number(ch.save.flags[`bounty.week.${wk}.count`] ?? 0));
  const claimed = ch.save.flags[`bounty.week.${wk}.claimed`] === true;
  return { count, target: WEEKLY_TARGET, claimed, ready: count >= WEEKLY_TARGET && !claimed };
}
export function claimWeeklyDecree(): ItemInstance | null {
  const ch = G.character;
  if (!ch || !weeklyDecree().ready) return null;
  const wk = bountyWeekKey();
  ch.save.flags[`bounty.week.${wk}.claimed`] = true;
  let item: ItemInstance | null = null;
  const loot = G.loot;
  if (loot) {
    item = loot.rollItem({ itemLevel: ch.level >= 60 ? 64 : ch.level, rarity: 'epic', classId: ch.classId, bound: true });
    if (!ch.addItem(item) && G.player) loot.dropItem(item, G.player.position);
  }
  ch.addMaterial('av_muhru', 30);
  ch.addMaterial('efsun_kilidi', 1);
  G.events.emit('bounty:changed', {});
  toast('Haftalık Ferman ödülü alındı!', 'loot');
  ch.persist();
  return item;
}

/** Rerolls available: 1 free per day, then 500 x level gold. */
export function rerollCost(): number {
  const ch = G.character;
  if (!ch) return 0;
  const used = Number(ch.save.flags[`bounty.${bountyDayKey()}.reroll`] ?? 0);
  return used < 1 ? 0 : 500 * ch.level;
}
export function rerollBounties(): boolean {
  const ch = G.character;
  if (!ch) return false;
  const day = bountyDayKey();
  const key = `bounty.${day}.reroll`;
  const cost = rerollCost();
  if (cost > 0 && !ch.spendGold(cost)) return false;
  // progress of the previous picks is dropped
  for (const k of Object.keys(ch.save.flags)) if (k.startsWith(`bounty.${day}.`) && !k.endsWith('.reroll') && !k.endsWith('.chest')) delete ch.save.flags[k];
  ch.save.flags[key] = Number(ch.save.flags[key] ?? 0) + 1;
  G.events.emit('bounty:changed', {});
  ch.persist();
  return true;
}

/** All three claimed and the daily chest not opened yet. */
export function dailyChestReady(): boolean {
  const ch = G.character;
  if (!ch) return false;
  const day = bountyDayKey();
  if (ch.save.flags[`bounty.${day}.chest`] === true) return false;
  const list = dailyBounties();
  return list.length >= 3 && list.every((b) => b.claimed);
}

/** Günlük Sandık: 1 Nadir+ item (25% Destansı), +5 Av Mührü, 25% Efsun Nesnesi, 10% Kutsama Kağıdı, 50% gem. */
export function claimDailyChest(): ItemInstance[] | null {
  const ch = G.character;
  if (!ch || !dailyChestReady()) return null;
  const day = bountyDayKey();
  ch.save.flags[`bounty.${day}.chest`] = true;
  const rng = new RNG(hashString(`chest:${day}:${ch.save.id}:${Date.now() >> 12}`));
  const out: ItemInstance[] = [];
  const loot = G.loot;
  const ilvl = ch.level >= 60 ? 64 : ch.level;
  if (loot) {
    const item = loot.rollItem({ itemLevel: ilvl, rarity: rng.chance(0.25) ? 'epic' : 'rare', classId: ch.classId });
    out.push(item);
    if (!ch.addItem(item) && G.player) loot.dropItem(item, G.player.position);
  }
  ch.addMaterial('av_muhru', 5);
  if (rng.chance(0.25)) ch.addMaterial('efsun_nesnesi', 1);
  if (rng.chance(0.1)) ch.addMaterial('kutsama_kagidi', 1);
  if (rng.chance(0.5)) {
    const grade = ch.level >= 60 ? 5 : ch.level >= 45 ? 4 : ch.level >= 30 ? 3 : ch.level >= 15 ? 2 : 1;
    ch.addMaterial(gemId(rng.pick(GEM_TYPES), grade), 1);
  }
  G.events.emit('bounty:changed', {});
  toast('Günlük Sandık açıldı!', 'loot');
  ch.persist();
  return out;
}

/**
 * Progress hook. Called by LootSystem (kills/gold/globes), Upgrade (upgrade/salvage) and the run:completed listener.
 * ctx.inTime: for Mythic+ completion.
 */
export function bountyEvent(kind: Bounty['kind'], amount = 1, ctx: { inTime?: boolean; enemyLevel?: number } = {}): void {
  const ch = G.character;
  if (!ch || amount <= 0) return;
  const day = bountyDayKey();
  const level = ch.level;
  const reroll = Number(ch.save.flags[`bounty.${day}.reroll`] ?? 0);
  let changed = false;
  for (const t of pickDailyTemplates(day, level, reroll)) {
    // "Ölümsüz": every Seçkin kill counts until the player dies (reset in initBounties)
    if (t.kind !== kind && !(kind === 'kill_elite' && t.kind === 'elite_nodeath')) continue;
    if (t.timedOnly && !ctx.inTime) continue;
    if (t.band && ctx.enemyLevel !== undefined && Math.abs(ctx.enemyLevel - level) > 5) continue;
    const key = progKey(day, t.id);
    const target = t.target(level);
    const cur = Number(ch.save.flags[key] ?? 0);
    if (cur >= target) continue;
    const next = Math.min(target, cur + amount);
    ch.save.flags[key] = next;
    changed = true;
    if (next >= target) toast(`Görev tamamlandı: ${t.title}`, 'success');
  }
  if (changed) {
    G.events.emit('bounty:changed', {});
    ch.persist();
  }
}

let hooked = false;
/** Subscribe to run completion (dungeon / Mythic+ bounties). Safe to call repeatedly. */
export function initBounties(): void {
  if (hooked || !G.events) return;
  hooked = true;
  G.events.on('run:completed', ({ state }) => {
    if (!state || state.failed) return;
    recordClear(state.dungeonId, state.difficulty);
    bountyEvent('dungeon', 1);
    if (state.keyLevel > 0) bountyEvent('mplus', 1, { inTime: state.inTime });
    firstClearBonus(state.dungeonId, state.keyLevel);
  });
  // "Ölümsüz": dying resets the unfinished no-death bounty
  G.events.on('player:died', ({ local }) => {
    const ch = G.character;
    if (!local || !ch) return;
    const day = bountyDayKey();
    const reroll = Number(ch.save.flags[`bounty.${day}.reroll`] ?? 0);
    let changed = false;
    for (const t of pickDailyTemplates(day, ch.level, reroll)) {
      if (t.kind !== 'elite_nodeath') continue;
      const key = progKey(day, t.id);
      const cur = Number(ch.save.flags[key] ?? 0);
      if (cur > 0 && cur < t.target(ch.level)) {
        ch.save.flags[key] = 0;
        changed = true;
      }
    }
    if (changed) G.events.emit('bounty:changed', {});
  });
}

/** Flag key of a per-difficulty dungeon clear ('normal' | 'heroic' | 'mythic' | 'mythicplus'). */
export const clearFlag = (dungeonId: string, difficulty: string): string => `clear.${dungeonId}.${difficulty}`;

/**
 * Has the local character cleared `dungeonId` on `difficulty`? Reads the per-difficulty flags written by recordClear();
 * the legacy single flag `clear.<id>` (any non-key difficulty, older saves) counts for Normal.
 */
export function hasCleared(dungeonId: string, difficulty: 'normal' | 'heroic' | 'mythic' | 'mythicplus'): boolean {
  const flags = G.character?.save.flags;
  if (!flags) return false;
  if (flags[clearFlag(dungeonId, difficulty)] === true) return true;
  return difficulty === 'normal' && flags[`clear.${dungeonId}`] === true;
}

/** Remember a finished run per dungeon + difficulty (GDD_CONTENT 6: Kahramanlık needs a Normal clear, Mitik 0 a Kahramanlık clear). */
export function recordClear(dungeonId: string, difficulty: string): void {
  const ch = G.character;
  if (!ch || !dungeonId || !difficulty) return;
  const key = clearFlag(dungeonId, difficulty);
  if (ch.save.flags[key] === true) return;
  ch.save.flags[key] = true;
  G.events.emit('bounty:changed', {});
  ch.persist();
}

/** First clear of a dungeon grants 50% of the current level's XP requirement (GDD 6.2). Once per dungeon id. */
function firstClearBonus(dungeonId: string, keyLevel: number): void {
  const ch = G.character;
  if (!ch || !dungeonId || keyLevel > 0 || ch.level >= 60) return;
  const key = `clear.${dungeonId}`;
  if (ch.save.flags[key] === true) return;
  ch.save.flags[key] = true;
  const xp = Math.round(0.5 * G.progression.xpToNext(ch.level));
  if (xp <= 0 || !isFinite(xp)) return;
  G.progression.addXp(xp);
  toast(`İlk temizleme bonusu: +${xp} TP`, 'levelup');
}
