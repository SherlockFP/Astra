import * as THREE from 'three';
import { G } from '../game/G';
import { toast } from './notify';
import { RNG, TAU, clamp, hashString } from '../core/utils';
import { RARITY_COLORS, type ClassId, type Rarity } from '../types/common';
import type { ItemCategory, ItemInstance } from '../types/items';
import type { RunState } from '../types/mythic';
import type { VfxHandle } from '../vfx/VFX';
import type { SfxId } from '../types/audio';
import type { Enemy } from '../entities/Enemy';
import type { EnemyRank } from '../types/enemies';
import { LootDrop, type DropPayload } from '../entities/LootDrop';
import { DROP_TABLES, GATHER_TABLES, LOOT, LOOT_TABLES, ILVL_MAX, MPLUS, PITY, RANK_ILVL_BONUS, chestStones, type DropTable, type LootTableDef, type RankKey } from '../data/loot';
import { GEM_TYPES, MATERIALS, gemId, potionIds } from '../data/materials';
import { CLASS_NAMES_TR } from '../data/itemBases';
import { familyOf, regionOfPack } from '../data/families';
import { generateItem, generateUnique, itemDisplayName, rarityIndex, sellValue, type RarityCtx } from './ItemGen';
import { bountyEvent, initBounties } from './Bounties';
import { QuestSystem } from './Quests';
import { isAffixUnit } from './Affixes';
import { tickUniqueEffects } from './UniqueEffects';
import { chestCtxOf, rollBossChest } from './ChestRoll';
import { addPity, eliteGuardDue, noteEliteItem, pityMult, resetPity } from './LootPity'; // Loot V3 §8: the shared legendary pity counter lives in save.flags
import { applyAction as autoApply, decide as autoDecide, tick as autoSalvageTick } from './AutoSalvage';
import { stampTrack } from './Track';
import type { BossPlacement } from '../types/dungeons';
import { getDungeon } from '../data/dungeons';
import { fissureEndRewards, fissureItemLevel, isFissureId } from '../world/procgen';

export interface RollOpts {
  itemLevel: number;
  rarity?: Rarity;              // force a rarity
  rarityBonus?: number;         // magic find style multiplier (fraction: 0.5 = +50%)
  category?: ItemCategory;
  classId?: ClassId;            // bias toward usable gear (smart loot)
  baseId?: string;
  /** items module extras */
  rank?: RankKey;
  minRarity?: Rarity;
  focus?: ItemCategory[];
  setChance?: number;
  legendaryMult?: number;
  bound?: boolean;
}

/** Metin reward window: damage dealt this long before the stone dies still counts (GDD_OPENWORLD 4.2). */
const CONTRIBUTION_WINDOW_SEC = 60;

/** Visible distance of labels by rarity (GDD 7.7) and label offset. */
const LABEL_DISTANCE: Record<Rarity, number> = { poor: 15, common: 15, uncommon: 20, rare: 30, epic: 45, legendary: 80, set: 80 };

const rankKeyOf = (enemy: Enemy): RankKey => {
  const def = enemy.def;
  if (def.role === 'swarm') return 'swarm';
  switch (def.rank) {
    case 'elite': return 'elite';
    case 'miniboss': return 'miniboss';
    case 'boss': return 'boss';
    default: return 'trash';
  }
};

/**
 * Open-world trash (camp members, levels 1-10 most of all): the dungeon trash table (8% item, 30% gold, 3% potion) left a levelling
 * player with almost nothing on the ground after a dozen kills. Trash and swarm kills outside dungeons roll more often; elites and
 * above keep their own tables. Gold piles stay small (their size is set by the level), so the change is in how often they appear.
 */
function openWorldTable(t: DropTable, rank: RankKey): DropTable {
  if (rank !== 'trash' && rank !== 'swarm') return t;
  return {
    ...t,
    itemChance: Math.min(1, t.itemChance * 1.5),
    goldChance: Math.max(t.goldChance, 0.55),
    potionChance: Math.max(t.potionChance, 0.06),
  };
}

/** Rank table of a kill, adjusted by its named table (base rank, per-table overrides, itemChanceMult). */
function namedTable(rank: RankKey, named?: LootTableDef): DropTable {
  if (!named) return DROP_TABLES[rank];
  const base = DROP_TABLES[named.base ?? rank];
  return {
    ...base,
    itemChance: Math.min(1, base.itemChance * (named.itemChanceMult ?? 1)),
    potionChance: named.potionChance ?? base.potionChance,
    gemChance: named.gemChance ?? base.gemChance,
    globeChance: named.globeChance ?? base.globeChance,
    globeCount: named.globeCount ?? base.globeCount,
  };
}

/** Vertical worlds: a drop is auto-picked / magnetised only within this height difference (ENGINE_VERTICALITY §16). */
const PICKUP_DY = 2.5;

const POTION_LEVELS = [1, 15, 30, 45, 60];
const potionTier = (level: number) => POTION_LEVELS.reduce((t, l, i) => (level >= l ? i + 1 : t), 1);
const gemGradeFor = (level: number) => (level >= 60 ? 5 : level >= 45 ? 4 : level >= 30 ? 3 : level >= 15 ? 2 : 1);

/**
 * PERSONAL loot: every peer rolls its own drops for its own local player when an enemy dies
 * (death events reach every peer). Drops are local-only LootDrop entities with rarity beams.
 * Also end-of-run chests and vendor stock generation.
 * OWNER: items/progression module (item generation in systems/ItemGen.ts).
 */
export class LootSystem {
  /** Live drops in the current world. */
  readonly drops: LootDrop[] = [];
  private rng: RNG;
  private clock = 0;
  private chain = { count: 0, timer: 0, xp: 0, paid: 0 };
  private lastBagFull = -9;
  private sfxTimes: Record<string, number> = {};
  private warnedUpdate = false;
  private scroll: { t: number; x: number; z: number; hp: number; fx: VfxHandle | null } | null = null;
  /** performance.now() of the last cancelled Dönüş Parşömeni (the HUD flashes 'Kesildi!'). */
  townScrollCancelledAt = 0;
  /** Entity id -> seconds (performance clock) of the local player's last hit on it. */
  private myHits = new Map<number, number>();

  constructor() {
    this.rng = new RNG(((Date.now() ^ (Math.random() * 2 ** 32)) >>> 0) || 1);
    G.events?.on('scene:leaving', () => this.clear());
    // remember when the local player last damaged each entity (Metin contributor rule)
    G.events?.on('damage', ({ targetId, sourceId }) => {
      if (sourceId !== null && G.player && sourceId === G.player.id) this.myHits.set(targetId, performance.now() / 1000);
    });
    initBounties();
    // open-world quests live next to the loot system (kills feed both); Game.ts may create G.quests earlier
    G.quests ??= new QuestSystem();
  }

  // ======================================================================== rolling
  /** Generate a random item. */
  rollItem(opts: RollOpts): ItemInstance {
    const ch = G.character;
    const mf = opts.rarityBonus ?? ch?.stats.magicFindPct ?? 0;
    const ctx: RarityCtx = { rank: opts.rank, magicFind: mf, minRarity: opts.minRarity, legendaryMult: opts.legendaryMult, allowSet: opts.rank === 'boss' || opts.rank === 'miniboss' };
    const item = generateItem({
      itemLevel: opts.itemLevel, rarity: opts.rarity, baseId: opts.baseId, category: opts.category, classId: opts.classId ?? ch?.classId,
      rarityCtx: ctx, focus: opts.focus, setChance: opts.setChance,
    }, this.rng);
    if (opts.bound || item.rarity === 'legendary' || item.rarity === 'set') item.bound = true;
    return item;
  }

  private hiddenByFilter(p: DropPayload): boolean {
    if (p.kind !== 'item' || !p.item) return false;
    const r = p.item.rarity;
    if (r === 'legendary' || r === 'set') return false;
    const f = G.settings?.data.lootFilter ?? 'all';
    const min = f === 'uncommon' ? 2 : f === 'rare' ? 3 : f === 'epic' ? 4 : 0;
    return rarityIndex(r) < min;
  }

  // ======================================================================== enemy deaths
  /** Called on every peer when an enemy dies (killer may be anyone in the party). */
  onEnemyKilled(enemy: Enemy): void {
    const ch = G.character;
    const world = G.world;
    const player = G.player;
    if (!ch || !world || !player) return;
    if (enemy.world && enemy.world !== world) return;
    // M+ affix units (explosive orbs, spiteful shades, Efsun guardians) and boss mechanic entities (cages, tombs, phylacteries) never reward
    if (isAffixUnit(enemy) || enemy.def.id.startsWith('proc_')) return;
    const rank = rankKeyOf(enemy);
    // vertical worlds: the corpse may stand on a ledge, so the drop starts from its own height, not from y 0
    const baseY = world.vertical ? enemy.position.y : 0;
    const origin = new THREE.Vector3(enemy.position.x, baseY + Math.max(0.9, enemy.height * 0.5), enemy.position.z);
    const dist = Math.hypot(player.position.x - enemy.position.x, player.position.z - enemy.position.z);
    const mp = G.mplus?.state;
    // Mitik 0 is treated as key 1 (GDD_CONTENT 5.2); a Kadim Yarık on Mitik is not Mitik 0 (own item ladder, normal drop tables)
    const keyLevel = mp && mp.keyLevel > 0 ? mp.keyLevel : mp && mp.difficulty === 'mythic' && !isFissureId(mp.dungeonId) ? 1 : 0;

    // ---- stats & bounties (Metin stones are objectives, not kills: they only feed the Metin bounty and loot)
    const isMetin = enemy.def.id.startsWith('metin_');
    const isRare = enemy.def.id.startsWith('rare_');
    // Metin stones pay (XP, loot, quest and bounty credit) only to players who damaged them recently
    if (isMetin && !this.contributed(enemy.id)) return;
    if (!isMetin) {
      ch.save.stats.kills++;
      if (rank === 'boss') ch.save.stats.bossKills++;
      bountyEvent('kill', 1);
      if (rank === 'elite' || rank === 'miniboss') bountyEvent('kill_elite', 1);
      if (rank === 'boss' || rank === 'miniboss') bountyEvent('boss', 1);
      if (world.players.length > 1) bountyEvent('party', 1);
    } else {
      bountyEvent('metin', 1, { enemyLevel: enemy.level });
    }
    if (isRare) bountyEvent('rare', 1, { enemyLevel: enemy.level });

    // ---- quests: every kill inside the instance counts for the local player (like XP)
    G.quests?.onKill({
      enemyId: enemy.def.id, family: familyOf(enemy.def.id), rank: enemy.def.rank,
      swarm: enemy.def.role === 'swarm', regionId: regionOfPack(enemy.packId),
    });

    // ---- xp (any distance inside the same instance)
    this.grantKillXp(enemy, rank, keyLevel);

    // ---- loot (anti-leech: within 60 units)
    if (dist > LOOT.maxDistance) return;
    this.rollKillDrops(enemy, rank, origin, keyLevel);
  }

  private grantKillXp(enemy: Enemy, rank: RankKey, keyLevel: number): void {
    const ch = G.character!;
    const world = G.world!;
    if (ch.level >= 60) return;
    const def = enemy.def;
    const lvl = Math.max(1, enemy.level || ch.level);
    let xp = G.progression.monsterXp(lvl, def.role === 'swarm' ? 'swarm' : (def.rank as EnemyRank), def.xp, ch.level);
    if (!keyLevel) xp *= 1 + (ch.stats.xpPct ?? 0);
    const n = Math.max(1, world.players.length);
    xp *= 1 + 0.05 * (n - 1);
    xp = Math.max(1, Math.round(xp));
    G.progression.addXp(xp); // vfx/HUD show the floating "+N" from the 'player:xp' event
    const p = G.player;

    // massacre chain (GDD 6.2): < 1.5 s between kills; bonus at 10/25/50/100
    const c = this.chain;
    c.count++;
    c.timer = 1.5;
    c.xp += xp;
    const bonusPct: Record<number, number> = { 10: 0.05, 25: 0.1, 50: 0.2, 100: 0.35 };
    if (bonusPct[c.count]) {
      const bonus = Math.round(c.xp * bonusPct[c.count]);
      if (bonus > 0) G.progression.addXp(bonus);
      toast(c.count >= 50 ? `KIYAMET ×${c.count}!` : `KATLİAM ×${c.count}!`, 'boss');
      G.events.emit('camera:shake', { intensity: 0.1 + Math.min(0.2, c.count / 400), duration: 0.3 });
      if (p && c.count >= 25) G.vfx.spawn('war_cry', p.position.clone().setY(0.2));
      if (p) G.vfx.damageNumber(p.pointAt(1.6), bonus, 'xp', `KATLİAM ×${c.count}!`);
    }
  }

  /**
   * Named loot table of a kill: the enemy's own table (rares, mini-bosses, metin stones), else the table of its camp (PackDef.lootTable:
   * the farm spots of GDD_OPENWORLD 3.7, "applies to every member of the camp").
   */
  private namedTableOf(enemy: Enemy): LootTableDef | undefined {
    if (enemy.def.lootTable) return LOOT_TABLES[enemy.def.lootTable];
    if (!enemy.packId) return undefined;
    const id = this.packLootId(enemy.packId);
    return id ? LOOT_TABLES[id] : undefined;
  }

  /** Pack id -> loot table id of the zone the local run is in (rebuilt when the zone changes). */
  private packLootIds: { zone: string; ids: Map<string, string> } | null = null;

  private packLootId(packId: string): string | undefined {
    const zone = G.mplus?.state?.dungeonId ?? G.mplus?.params?.dungeonId ?? '';
    if (!zone) return undefined;
    let cache = this.packLootIds;
    if (!cache || cache.zone !== zone) {
      const ids = new Map<string, string>();
      for (const p of getDungeon(zone)?.packs ?? []) if (p.lootTable) ids.set(p.id, p.lootTable);
      cache = { zone, ids };
      this.packLootIds = cache;
    }
    return cache.ids.get(packId);
  }

  private rollKillDrops(enemy: Enemy, rank: RankKey, origin: THREE.Vector3, keyLevel: number): void {
    const ch = G.character!;
    const rng = this.rng;
    const def = enemy.def;
    const named = this.namedTableOf(enemy);
    const openWorld = regionOfPack(enemy.packId) !== undefined;
    const table = openWorld ? openWorldTable(namedTable(rank, named), rank) : namedTable(rank, named);
    const stats = ch.stats;
    const mf = stats.magicFindPct ?? 0;
    const gf = stats.goldFindPct ?? 0;
    const lvl = Math.max(1, enemy.level || ch.level);
    const bossLike = rank === 'boss' || rank === 'miniboss';
    const drops: { payload: DropPayload }[] = [];
    // Loot V3 §6: generic drops pass the auto-salvage gate first (gray -> sold, white / green -> salvaged, protected items always drop)
    const pushItem = (item: ItemInstance, gate = true) => {
      if (gate) {
        const act = autoDecide(item);
        if (act !== 'keep') {
          autoApply(item, act);
          return;
        }
      }
      drops.push({ payload: { kind: 'item', item, rarity: item.rarity } });
    };
    const pityRank = rank === 'elite' || rank === 'miniboss' || def.id.startsWith('rare_');

    // ---- item level
    let ilvl = clamp(lvl + RANK_ILVL_BONUS[rank], 1, 60);
    if (keyLevel) ilvl = rank === 'boss' ? Math.min(MPLUS.bossCap, MPLUS.ilvlBase + keyLevel + MPLUS.bossBonus) : Math.min(MPLUS.ilvlCap, MPLUS.ilvlBase + keyLevel);

    // ---- boss chest (Loot V3 §2): 1 guaranteed item (2 levelling) + a chance of a second, the boss's named item with named pity,
    // hard legendary pity, Yiğitlik Taşı. The items are the boss's personal ground drops (no chest entity yet: see loot_v3_status.md).
    let gotLegend = false;
    let chestBoss = false;
    if (rank === 'boss') {
      chestBoss = true;
      const mpState = G.mplus?.state;
      const dungeonId = mpState?.dungeonId ?? G.mplus?.params?.dungeonId;
      const dungeon = dungeonId ? getDungeon(dungeonId) : undefined;
      const ctxId = chestCtxOf(mpState?.difficulty, keyLevel, openWorld || !mpState || !!dungeon?.outdoor);
      const last = (dungeon?.bosses ?? []).reduce<BossPlacement | null>((a, b) => (!a || b.order > a.order ? b : a), null);
      if (dungeon?.fissure) ilvl = fissureItemLevel(dungeon.fissure.tier, lvl, !!last && last.bossId === def.id);
      const res = rollBossChest({ bossId: def.id, ctx: ctxId, keyLevel: ctxId === 'mplus' ? keyLevel : 0, final: !!last && last.bossId === def.id, ilvl, classId: ch.classId, table: named, magicFind: mf }, ch.save.flags, rng);
      for (const it of res.items) {
        if (it.rarity === 'legendary' || it.rarity === 'set') gotLegend = true;
        pushItem(it, false);
      }
      if (res.stones) {
        ch.addMaterial(res.stones.id, res.stones.count);
        toast(`+${res.stones.count} ${MATERIALS[res.stones.id]?.name ?? res.stones.id}`, 'loot');
      }
    }

    // ---- equipment
    let itemCount = 0;
    if (chestBoss) {
      // rolled by the chest above
    } else if (keyLevel) {
      if (rank === 'boss' || named?.mplusItem) itemCount = 1;
      else if (rank === 'elite' || rank === 'miniboss') itemCount = rng.chance(MPLUS.eliteItemChance) ? 1 : 0;
    } else {
      if (rng.chance(table.itemChance)) itemCount = table.itemRolls;
      for (const c of table.extraRolls) if (rng.chance(c)) itemCount++;
      if (named?.items) itemCount = rng.int(named.items[0], named.items[1]);
      if (named?.extraItems) itemCount += named.extraItems;
      if (enemy.champion) itemCount++;
    }
    for (let i = 0; i < itemCount; i++) {
      let minRarity: Rarity | undefined;
      if (keyLevel) minRarity = rank === 'boss' ? 'rare' : 'uncommon';
      else if (table.minRarity && i < (table.minRarityCount ?? 0)) minRarity = table.minRarity;
      if (named?.minRarity && i < (named.minRarityCount ?? 1) && (!minRarity || rarityIndex(named.minRarity) > rarityIndex(minRarity))) minRarity = named.minRarity;
      // champion (GDD 1.4): open world = Büyülü+ with a 25% Nadir; dungeons keep the guaranteed Nadir
      if (enemy.champion && i === itemCount - 1) minRarity = openWorld ? (rng.chance(0.25) ? 'rare' : 'uncommon') : 'rare';
      // Seçkin bad-luck guard (§7): 4 elite items in a row below Nadir -> the next one is Nadir or better
      if (rank === 'elite' && eliteGuardDue(ch.save.flags) && (!minRarity || rarityIndex(minRarity) < rarityIndex('rare'))) minRarity = 'rare';
      const item = this.rollItem({
        itemLevel: ilvl, classId: ch.classId, rarityBonus: mf, rank: rank === 'swarm' ? 'trash' : rank, minRarity,
        focus: named?.focus, setChance: rank === 'boss' ? named?.setChance ?? 0.1 : 0,
        legendaryMult: (pityRank ? pityMult(ch.save.flags) : 1) * (named?.legendaryMult ?? 1),
      });
      if (item.rarity === 'legendary' || item.rarity === 'set') gotLegend = true;
      if (rank === 'elite') noteEliteItem(ch.save.flags, rarityIndex(item.rarity) >= rarityIndex('rare'));
      pushItem(item);
    }
    // ---- open-world uniques (stat-only Vadi Efsanevileri): one roll per killed member of the table
    if (!chestBoss && named?.uniqueIds?.length && rng.chance(named.uniqueChance ?? 0.15)) pushItem(generateUnique(rng.pick(named.uniqueIds), ilvl, rng, ch.classId));
    // ---- pity (Loot V3 §8.1): elites, mini-bosses and named rares feed the shared counter, a legendary / set resets it (bosses: the chest does)
    if (!chestBoss && pityRank) {
      const isRareMob = def.id.startsWith('rare_');
      if (gotLegend) resetPity(ch.save.flags);
      else addPity(ch.save.flags, isRareMob ? PITY.feed.rare : rank === 'miniboss' ? PITY.feed.miniboss : keyLevel ? PITY.feed.eliteMplus : PITY.feed.elite);
      // stones (§7, §9.2): a named rare in the open world gives 2 Çırak, a mini-boss 1 of its difficulty's grade at 50 %
      if (isRareMob && openWorld) ch.addMaterial('yt_cirak', 2);
      else if (rank === 'miniboss' && G.mplus?.state && !openWorld && rng.chance(0.5)) {
        const st = chestStones(chestCtxOf(G.mplus.state.difficulty, keyLevel, false), keyLevel, false);
        if (st) ch.addMaterial(st.id, 1);
      }
    }

    // ---- gold
    if (rng.chance(table.goldChance)) {
      const avg = 2 + 0.5 * lvl;
      const total = Math.max(1, Math.round(avg * (named?.goldMult ?? table.goldMult) * rng.range(0.6, 1.4) * (1 + gf)));
      const piles = named?.piles ?? (rank === 'boss' ? 10 : rank === 'miniboss' ? 6 : rank === 'elite' ? 3 : 1);
      let left = total;
      for (let i = 0; i < piles; i++) {
        const part = i === piles - 1 ? left : Math.max(1, Math.round(total / piles * rng.range(0.7, 1.3)));
        left -= Math.min(left, part);
        if (part > 0) drops.push({ payload: { kind: 'gold', gold: part, rarity: 'common' } });
      }
    }

    // ---- potions
    if (rng.chance(table.potionChance)) {
      const tier = potionTier(lvl);
      const id = potionIds(rng.chance(0.6) ? 'hp' : 'mp')[Math.min(4, tier - 1)];
      drops.push({ payload: { kind: 'material', material: { id, count: 1 }, rarity: MATERIALS[id]?.rarity ?? 'common' } });
    }
    // ---- health globes
    if (rng.chance(table.globeChance)) {
      const n = rng.int(table.globeCount[0], table.globeCount[1]);
      for (let i = 0; i < n; i++) drops.push({ payload: { kind: 'globe', rarity: 'rare' } });
    }
    // ---- gems
    if (rng.chance(table.gemChance)) {
      const grade = keyLevel >= 15 && rng.chance(0.1) ? 6 : keyLevel >= 10 ? 5 : gemGradeFor(lvl);
      const id = gemId(rng.pick(GEM_TYPES), grade);
      drops.push({ payload: { kind: 'material', material: { id, count: 1 }, rarity: MATERIALS[id]?.rarity ?? 'common' } });
    }
    // ---- materials
    for (const m of table.materials) {
      if (m.minLevel && lvl < m.minLevel) continue;
      if (rng.chance(Math.min(1, m.chance * (named?.matMult?.[m.id] ?? 1)))) drops.push({ payload: { kind: 'material', material: { id: m.id, count: 1 }, rarity: MATERIALS[m.id]?.rarity ?? 'common' } });
    }
    // ---- named-table bonus rolls: farm spots, Metin / rare / mini-boss tables (GDD 3.7, 4.5, 3.5, 3.6)
    for (const b of named?.bonus ?? []) {
      if (b.rank === 'trash' && rank !== 'trash' && rank !== 'swarm') continue;
      if (b.rank === 'elite' && rank !== 'elite' && rank !== 'miniboss' && rank !== 'boss') continue;
      if (!rng.chance(b.chance)) continue;
      const count = b.count ? rng.int(b.count[0], b.count[1]) : 1;
      const id = b.id.startsWith('gem_random_') ? gemId(rng.pick(GEM_TYPES), Number(b.id.slice('gem_random_'.length))) : b.id;
      if (count > 0) drops.push({ payload: { kind: 'material', material: { id, count }, rarity: MATERIALS[id]?.rarity ?? 'common' } });
    }
    if (keyLevel && rank === 'boss') {
      drops.push({ payload: { kind: 'material', material: { id: 'ruh_tasi', count: 1 }, rarity: 'epic' } });
      drops.push({ payload: { kind: 'material', material: { id: 'ejderha_pulu', count: 1 }, rarity: 'rare' } });
    }
    // ---- quest items: collect objectives and Av Defteri trophies (only while their quest / step is active)
    for (const q of G.quests?.rollDrops({
      enemyId: def.id, family: familyOf(def.id), rank: def.rank, swarm: def.role === 'swarm', regionId: regionOfPack(enemy.packId),
    }) ?? []) {
      drops.push({ payload: { kind: 'material', material: { id: q.id, count: q.count }, rarity: MATERIALS[q.id]?.rarity ?? 'common' } });
    }
    // ---- open-world champion: +1 Metin Kalintisi (GDD 1.4)
    if (enemy.champion && openWorld) drops.push({ payload: { kind: 'material', material: { id: 'metin_kalintisi', count: 1 }, rarity: MATERIALS.metin_kalintisi?.rarity ?? 'common' } });
    if (!drops.length) return;

    // ---- spawn: bosses do a spiral fountain, others scatter with 40 ms stagger
    const fountain = rank === 'boss' || enemy.champion || (rank === 'miniboss' && drops.length > 4) || drops.length > 9;
    let idx = 0;
    const total = drops.length;
    for (const d of drops) {
      if (fountain) {
        const ang = (idx / Math.max(6, total)) * TAU * 1.5 + rng.range(-0.2, 0.2);
        const r = 2 + (idx / Math.max(1, total)) * 3;
        const spot = this.findSpot(origin, ang, r, true);
        this.spawnDrop(d.payload, origin, { delay: 0.45 + idx * 0.12, spot, vy: 8 + rng.range(0, 2) });
      } else this.spawnDrop(d.payload, origin, { delay: idx * 0.04 });
      idx++;
    }
  }

  // ======================================================================== spawning
  /** Pick a landing spot around `origin` (walkable, in line of sight, >= 0.8 from other drops). */
  private findSpot(origin: THREE.Vector3, angle?: number, radius?: number, spiral = false): THREE.Vector3 {
    const nav = G.world?.nav;
    const rng = this.rng;
    for (let attempt = 0; attempt < 12; attempt++) {
      const ang = angle !== undefined && attempt < 3 ? angle + attempt * 0.9 : rng.range(0, TAU);
      let r = (radius ?? rng.range(1.5, 4)) * (attempt > 5 ? 0.55 : 1);
      if (!spiral && radius === undefined) r = rng.range(1.5, 4) * (attempt > 5 ? 0.55 : 1);
      const x = origin.x + Math.cos(ang) * r, z = origin.z + Math.sin(ang) * r;
      if (nav && (!nav.isStandable(x, z) || !nav.lineOfSight(origin.x, origin.z, x, z))) continue;
      let ok = true;
      for (const d of this.drops) {
        if (d.removed) continue;
        const s = d.landingSpot;
        if ((s.x - x) ** 2 + (s.z - z) ** 2 < 0.64) {
          ok = false;
          break;
        }
      }
      if (ok) return new THREE.Vector3(x, G.world?.groundY(x, z) ?? 0, z);
    }
    const near = nav?.nearestWalkable(origin.x, origin.z);
    const nx = near?.x ?? origin.x + rng.range(-0.5, 0.5), nz = near?.z ?? origin.z + rng.range(-0.5, 0.5);
    return new THREE.Vector3(nx, G.world?.groundY(nx, nz) ?? 0, nz);
  }

  private spawnDrop(payload: DropPayload, origin: THREE.Vector3, opts: { delay?: number; spot?: THREE.Vector3; vy?: number } = {}): LootDrop | null {
    const world = G.world;
    if (!world) return null;
    const spot = opts.spot ?? this.findSpot(origin);
    const drop = new LootDrop(world.allocLocalId(), payload, { origin, target: spot, delay: opts.delay, vy: opts.vy });
    drop.hiddenByFilter = this.hiddenByFilter(payload);
    world.add(drop);
    this.drops.push(drop);
    // keep the scene light: drop the oldest cheap pickups beyond 160
    if (this.drops.length > 160) {
      const victim = this.drops.find((d) => !d.removed && d.drop.kind === 'item' && d.drop.rarity === 'poor') ?? this.drops.find((d) => !d.removed && d.drop.kind === 'gold');
      victim?.destroy();
    }
    return drop;
  }

  /** Spawn a dropped item in the world (beam + sound by rarity). */
  dropItem(item: ItemInstance, pos: THREE.Vector3 | { x: number; y?: number; z: number }, opts: { delay?: number } = {}): void {
    const origin = new THREE.Vector3(pos.x, Math.max(0.9, (pos.y ?? 0) + 1), pos.z);
    this.spawnDrop({ kind: 'item', item, rarity: item.rarity }, origin, { delay: opts.delay });
  }

  dropGold(amount: number, pos: THREE.Vector3 | { x: number; y?: number; z: number }): void {
    const total = Math.round(amount);
    if (total <= 0) return;
    const origin = new THREE.Vector3(pos.x, Math.max(0.9, (pos.y ?? 0) + 1), pos.z);
    const piles = total >= 800 ? 6 : total >= 300 ? 4 : total >= 100 ? 2 : 1;
    let left = total;
    for (let i = 0; i < piles; i++) {
      const part = i === piles - 1 ? left : Math.max(1, Math.round(total / piles));
      left -= part;
      this.spawnDrop({ kind: 'gold', gold: part, rarity: 'common' }, origin, { delay: i * 0.05 });
    }
  }

  /** Drop a stackable (potion, gem, scroll...) on the ground. */
  dropMaterial(id: string, count: number, pos: THREE.Vector3 | { x: number; y?: number; z: number }): void {
    const origin = new THREE.Vector3(pos.x, Math.max(0.9, (pos.y ?? 0) + 1), pos.z);
    this.spawnDrop({ kind: 'material', material: { id, count }, rarity: MATERIALS[id]?.rarity ?? 'common' }, origin);
  }

  dropGlobe(pos: THREE.Vector3 | { x: number; y?: number; z: number }): void {
    const origin = new THREE.Vector3(pos.x, Math.max(0.9, (pos.y ?? 0) + 1), pos.z);
    this.spawnDrop({ kind: 'globe', rarity: 'rare' }, origin);
  }

  // ======================================================================== landing / feedback
  private sfx(id: SfxId, pos: THREE.Vector3, volume = 1, pitch = 1): void {
    const last = this.sfxTimes[id] ?? -9;
    if (this.clock - last < 0.05) return;
    this.sfxTimes[id] = this.clock;
    try {
      G.audio.play(id, { pos: [pos.x, pos.y, pos.z], volume, pitch, pitchVar: 0.1 });
    } catch {
      /* audio not ready */
    }
  }

  /** Called by LootDrop the first time it touches the ground. */
  onDropLanded(drop: LootDrop): void {
    const d = drop.drop;
    const pos = drop.object3d.position;
    const r = d.rarity;
    // sound
    if (d.kind === 'gold') this.sfx('loot_drop', pos, 0.5, 1.35);
    else if (d.kind === 'globe') this.sfx('loot_drop', pos, 0.5, 1.1);
    else if (d.kind === 'item' && !drop.hiddenByFilter) {
      if (r === 'legendary' || r === 'set') this.sfx('loot_drop_legendary', pos, 1);
      else if (r === 'epic') this.sfx('loot_drop_epic', pos, 0.9);
      else if (r === 'rare') this.sfx('loot_drop_rare', pos, 0.8);
      else this.sfx('loot_drop', pos, r === 'poor' ? 0.35 : 0.6);
    } else this.sfx('loot_drop', pos, 0.5);
    // label
    const color = RARITY_COLORS[r];
    const name = drop.displayName;
    const html = `<span style="display:inline-block;padding:1px 7px;background:rgba(8,6,4,.72);color:${color};border:1px solid ${color}66;border-radius:2px;font:700 13px/1.25 'Alegreya Sans',system-ui,sans-serif;text-shadow:0 1px 0 #000;white-space:nowrap;cursor:pointer">${escapeHtml(name)}</span>`;
    const dist = d.kind === 'item' ? LABEL_DISTANCE[r] : 14;
    drop.createLabel(html, d.kind === 'item' ? 1.15 : 0.95, dist);
    // epic: soft screen-edge flash
    if (d.kind === 'item' && !drop.hiddenByFilter && r === 'epic') G.ui?.flashEdge?.(color, 0.5);
    // big drops: shake + toast + event
    if (d.kind === 'item' && !drop.hiddenByFilter && (r === 'legendary' || r === 'set')) {
      G.events.emit('camera:shake', { intensity: 0.12, duration: 0.35 }); // vfx feedback adds the screen flash on 'loot:dropped'
      toast(`${r === 'set' ? 'Set parçası' : 'Efsanevi eşya'} düştü: ${name}`, 'loot');
    }
    G.events.emit('loot:dropped', {
      uid: d.item?.uid ?? `${d.kind}_${drop.id}`, rarity: r, pos: [pos.x, pos.y, pos.z], gold: d.kind === 'gold' ? d.gold : undefined,
    });
  }

  // ======================================================================== pickup
  /** Pick a drop up (F, walk-over, magnet, label click). */
  pickup(drop: LootDrop): boolean {
    const ch = G.character;
    if (!ch || drop.removed) return false;
    const d = drop.drop;
    const player = G.player;
    switch (d.kind) {
      case 'item': {
        const item = d.item!;
        if (!ch.addItem(item)) {
          if (this.clock - this.lastBagFull > 1.2) {
            this.lastBagFull = this.clock;
            toast('Çantan dolu!', 'error');
          }
          drop.magnet = false;
          drop.forcePickup = false;
          return false;
        }
        G.events.emit('loot:pickedUp', { item });
        if (rarityIndex(item.rarity) >= 2) toast(`Alındı: ${itemDisplayName(item)}`, 'loot');
        break;
      }
      case 'gold': {
        const amount = d.gold ?? 0;
        ch.addGold(amount);
        bountyEvent('gold', amount);
        G.events.emit('loot:pickedUp', { gold: amount });
        const heal = ch.specialParams('leg_merchant_kings_ring').healPct;
        if (heal && player) G.combat?.healPlayer(null, player, Math.round(player.maxHp * heal));
        break;
      }
      case 'material': {
        const m = d.material!;
        ch.addMaterial(m.id, m.count);
        G.events.emit('loot:pickedUp', { material: m });
        const def = MATERIALS[m.id];
        toast(`+${m.count} ${def?.name ?? m.id}`, rarityIndex(def?.rarity ?? 'common') >= 3 ? 'loot' : 'info');
        break;
      }
      case 'globe': {
        if (player) {
          const amount = Math.round(player.maxHp * LOOT.globeHealPct);
          G.combat?.healPlayer(null, player, amount);
          for (const ally of G.world?.players ?? []) {
            if (ally === player || ally.isDead) continue;
            if (Math.hypot(ally.position.x - player.position.x, ally.position.z - player.position.z) <= LOOT.globeAllyRadius) G.combat?.healPlayer(player, ally, Math.round(ally.maxHp * LOOT.globeHealPct));
          }
          G.vfx.spawn('heal_burst', player.position.clone().setY(0.4), { scale: 0.8 });
        }
        bountyEvent('globe', 1);
        G.events.emit('loot:pickedUp', { globe: true });
        break;
      }
    }
    drop.detachBeam();
    drop.destroy();
    return true;
  }

  /** Label click: suck the item to the player when it is reasonably close. */
  clickPickup(drop: LootDrop): void {
    const p = G.player;
    if (!p || drop.removed || !drop.landed) return;
    const d = drop.distTo(p.position.x, p.position.z);
    if (d > 12) {
      toast('Eşya çok uzakta.', 'warning');
      return;
    }
    if (drop.drop.kind === 'item' && G.character && G.character.freeBagSlots() <= 0 && !G.character.findItem(drop.drop.item!.uid)) {
      toast('Çantan dolu!', 'error');
      return;
    }
    drop.magnet = true;
    drop.forcePickup = true;
  }

  // ======================================================================== per-frame
  /** Auto-pickup gold / filtered items, magnet effect. */
  update(dt: number): void {
    try {
      this.updateInner(dt);
    } catch (e) {
      if (!this.warnedUpdate) {
        this.warnedUpdate = true;
        console.error('[loot] update failed', e);
      }
    }
  }

  private updateInner(dt: number): void {
    this.clock += dt;
    const ch = G.character;
    if (G.world) tickUniqueEffects(); // Loot V3: lazy unique-effect bridge (roll / break / kick triggers)
    autoSalvageTick(dt);
    if (ch) {
      ch.tickBuffs(dt);
      ch.save.playedSec += dt;
    }
    if (this.scroll) this.tickTownScroll(dt);
    if (this.chain.count > 0) {
      this.chain.timer -= dt;
      if (this.chain.timer <= 0) this.chain = { count: 0, timer: 0, xp: 0, paid: 0 };
    }
    const world = G.world;
    if (!world) return;
    for (let i = this.drops.length - 1; i >= 0; i--) if (this.drops[i].removed) this.drops.splice(i, 1);
    const player = G.player;
    if (!player || !ch) return;
    const px = player.position.x, pz = player.position.z;
    const alive = !player.isDead;
    const alt = !!G.input?.down?.('freeCursor');
    const autoLoot = G.settings?.data.autoLoot ?? true;
    const pr = ch.stats.pickupRadius ?? 0;
    for (const d of this.drops) {
      if (d.removed || !d.landed) continue;
      const dist = d.distTo(px, pz);
      const kind = d.drop.kind;
      // label visibility
      const rar = d.drop.rarity;
      let labelDist = kind === 'item' ? LABEL_DISTANCE[rar] : 14;
      if (alt) labelDist = 80;
      const show = kind === 'item' && d.hiddenByFilter ? alt && dist < 30 : dist <= labelDist;
      d.setLabelVisible(show);
      // expiry
      const life = kind === 'globe' ? LOOT.globeLife : LOOT.dropLife;
      if (d.sinceLanded > life) {
        d.detachBeam();
        d.destroy();
        continue;
      }
      if (!alive) continue;
      if (d.magnet) {
        const chest = Math.hypot(d.object3d.position.x - px, d.object3d.position.z - pz, d.object3d.position.y - (player.position.y + 0.9));
        if (chest < 0.85) this.pickup(d);
        continue;
      }
      // vertical worlds: a drop on another level (balcony, pit floor) is neither magnetised nor picked up from here
      if (world.vertical && Math.abs(d.object3d.position.y - player.position.y) > PICKUP_DY) continue;
      if (d.sinceLanded < 0.25) continue;
      switch (kind) {
        case 'gold': {
          const magnet = LOOT.goldMagnet + pr;
          if (dist <= magnet) d.magnet = true;
          break;
        }
        case 'globe': {
          if (dist <= LOOT.globeMagnet + pr * 0.5) d.magnet = true;
          break;
        }
        case 'material': {
          if (dist <= LOOT.pouchMagnet + pr * 0.5) d.magnet = true;
          break;
        }
        case 'item': {
          if (!autoLoot || d.hiddenByFilter || d.drop.rarity === 'poor') break;
          if (d.sinceLanded > 0.45 && dist <= LOOT.pouchPickup) this.pickup(d);
          break;
        }
      }
    }
  }

  // ======================================================================== Dönüş Parşömeni (town scroll)
  /** Read a Dönüş Parşömeni: 3 s channel (moving or taking damage cancels it), then the scene switches to town. Dungeons only, not in Mythic+. */
  useTownScroll(): { ok: boolean; reason?: string } {
    const ch = G.character;
    const p = G.player;
    if (!ch || !p || !G.world) return { ok: false, reason: 'Şu anda kullanılamaz.' };
    if (this.scroll) return { ok: false, reason: 'Parşömen zaten okunuyor.' };
    if (p.isDead) return { ok: false, reason: 'Ölüyken kullanılamaz.' };
    if (G.scenes?.current?.id !== 'dungeon') return { ok: false, reason: 'Zaten şehirdesin.' };
    if ((G.mplus?.state?.keyLevel ?? 0) > 0) return { ok: false, reason: 'Mitik+ koşularında kullanılamaz.' };
    if (G.scenes.isSwitching) return { ok: false, reason: 'Şu anda kullanılamaz.' };
    if (ch.material('scroll_town') < 1) return { ok: false, reason: 'Dönüş Parşömenin yok.' };
    let fx: VfxHandle | null = null;
    try {
      fx = G.vfx.spawn('portal_swirl', p.position.clone().setY(0.05), { duration: 3, scale: 0.8, follow: p.object3d });
    } catch {
      /* vfx not ready */
    }
    this.scroll = { t: 0, x: p.position.x, z: p.position.z, hp: p.hp, fx };
    toast('Dönüş Parşömeni okunuyor... Kıpırdama! (3 sn)', 'info');
    this.sfx('buff', p.position, 0.8, 1);
    return { ok: true };
  }

  cancelTownScroll(reason?: string): void {
    const s = this.scroll;
    if (!s) return;
    this.scroll = null;
    try {
      s.fx?.stop();
    } catch {
      /* ignore */
    }
    if (reason) {
      this.townScrollCancelledAt = performance.now();
      this.sfx('ui_error', G.player?.position ?? new THREE.Vector3(), 0.5, 0.9);
      toast(reason, 'warning');
    }
  }

  /** True while a Dönüş Parşömeni is being read. */
  get townScrollActive(): boolean {
    return !!this.scroll;
  }

  get townScrollProgress(): number {
    return this.scroll ? Math.min(1, this.scroll.t / 3) : 0;
  }

  private tickTownScroll(dt: number): void {
    const s = this.scroll!;
    const p = G.player;
    if (!p || !G.world) {
      this.cancelTownScroll();
      return;
    }
    if (p.isDead) return this.cancelTownScroll('Dönüş Parşömeni iptal edildi.');
    if (Math.hypot(p.position.x - s.x, p.position.z - s.z) > 0.8) return this.cancelTownScroll('Hareket ettin: Dönüş Parşömeni iptal edildi.');
    if (p.hp < s.hp - 0.5) return this.cancelTownScroll('Hasar aldın: Dönüş Parşömeni iptal edildi.');
    s.hp = Math.max(s.hp, p.hp);
    s.t += dt;
    if (s.t < 3) return;
    this.scroll = null;
    const ch = G.character;
    if (!ch || !ch.useMaterial('scroll_town', 1)) return;
    toast('Şehre dönülüyor...', 'success');
    G.events.emit('camera:shake', { intensity: 0.06, duration: 0.25 });
    G.vfx.spawn('level_up', p.position.clone().setY(0.05), { scale: 0.7 });
    // open world (Sisli Koru) -> the town's south gate, dungeons -> the portal hall
    const zoneId = G.mplus?.params?.dungeonId ?? G.mplus?.state?.dungeonId;
    const outdoor = !!zoneId && !!getDungeon(zoneId)?.outdoor;
    void G.scenes.go('town', { spawnAt: outdoor ? 'south' : 'portal' }).catch((e) => console.error('[loot] town scroll failed', e));
  }

  // ======================================================================== chests & vendors
  /**
   * Rewards for a finished run (M+ chest: more items when timed / higher upgrade). Rolled by EVERY peer for its own character.
   * Also DEPOSITS everything: gold/materials are granted, items go to the bag (overflow drops at the player's feet).
   * `CharacterState.addItem` is idempotent by uid, so a caller that adds the returned items again is harmless.
   */
  endOfRunRewards(state: RunState): ItemInstance[] {
    const ch = G.character;
    if (!ch || state.failed) return [];
    const rng = this.rng;
    // Kadim Yarık: the boss chests already rolled the items; the end chest pays gold, magic dust and dragon coins (GDD_PROCGEN 9.2)
    const fis = isFissureId(state.dungeonId) ? getDungeon(state.dungeonId)?.fissure : undefined;
    if (fis) {
      const r = fissureEndRewards(fis.tier, fis.level, fis.mods);
      ch.addGold(r.gold);
      ch.addMaterial('buyulu_toz', r.dust);
      if (r.dragonCoins > 0) ch.addMaterial('ejderha_pulu', r.dragonCoins);
      toast(`Yarık ödülü: +${r.gold} altın, +${r.dust} Büyülü Toz${r.dragonCoins > 0 ? `, +${r.dragonCoins} Ejderha Pulu` : ''}`, 'loot');
      return [];
    }
    const key = Math.max(0, state.keyLevel);
    const timed = state.inTime;
    const out: ItemInstance[] = [];
    let ilvl: number, count: number, minRarity: Rarity;
    let weights: Partial<Record<Rarity, number>> | undefined;
    if (key >= 2) {
      ilvl = MPLUS.chestIlvl(key) - (timed ? 0 : 4);
      count = timed ? 2 : 1;
      const epic = Math.min(70, 25 + 3 * key), legend = Math.min(12, 3 + 0.5 * key), set = Math.min(14, 5 + 0.5 * key);
      weights = { rare: Math.max(4, 100 - epic - legend - set), epic, legendary: legend, set };
      minRarity = 'rare';
    } else if (state.difficulty === 'mythic') {
      ilvl = MPLUS.chestIlvl(1); count = 2; minRarity = 'rare'; // Mitik 0 = key 1 (chest ilvl 62, no vault credit)
      weights = { rare: 70, epic: 27, legendary: 3 };
    } else if (state.difficulty === 'heroic') {
      ilvl = Math.min(60, ch.level + 2); count = 1; minRarity = 'rare';
      weights = { uncommon: 40, rare: 48, epic: 11, legendary: 1 };
    } else {
      ilvl = Math.max(1, ch.level); count = 1; minRarity = 'uncommon';
      weights = { uncommon: 65, rare: 30, epic: 5 };
    }
    ilvl = clamp(Math.round(ilvl), 1, ILVL_MAX);
    // Loot V3: the end chest shares the legendary pity (weight x pity multiplier; any legendary / set resets it, else +1) and feeds the Yiğitlik Yolu
    if (weights?.legendary) weights = { ...weights, legendary: weights.legendary * pityMult(ch.save.flags) };
    const endCtx = key >= 2 ? 'mplus' : state.difficulty === 'mythic' ? 'mythic0' : state.difficulty === 'heroic' ? 'heroic' : 'normal';
    for (let i = 0; i < count; i++) {
      const item = generateItem({ itemLevel: ilvl, classId: ch.classId, rarityCtx: { weights, minRarity, allowSet: true }, setChance: key >= 2 ? 0.1 : 0 }, rng);
      item.bound = true;
      item.src = { d: state.dungeonId, k: key, df: endCtx === 'mplus' ? 'k' : endCtx === 'mythic0' ? 'm' : endCtx === 'heroic' ? 'h' : 'n' };
      stampTrack(item, endCtx, key);
      out.push(item);
    }
    if (out.some((it) => it.rarity === 'legendary' || it.rarity === 'set')) resetPity(ch.save.flags);
    else addPity(ch.save.flags, PITY.feed.boss);
    // extras (granted directly)
    if (key >= 2) {
      ch.addGold(2000 * key);
      ch.addMaterial(key >= 7 ? 'yt_efsane' : 'yt_sampiyon', timed ? 4 + key : Math.floor((4 + key) / 2)); // Loot V3 §9.2
      ch.addMaterial('ruh_tasi', 1 + Math.floor(key / 3));
      ch.addMaterial('ejderha_pulu', 2 + Math.floor(key / 2));
      ch.addMaterial('buyulu_toz', 10 + 2 * key);
      if (rng.chance(0.3)) {
        const grade = key >= 15 && rng.chance(0.1) ? 6 : key >= 10 ? 5 : gemGradeFor(60);
        ch.addMaterial(gemId(rng.pick(GEM_TYPES), grade), 1);
      }
      if (timed) {
        if (key >= 5) ch.addMaterial('efsun_nesnesi', 1);
        if (key >= 8 && rng.chance(0.5)) ch.addMaterial('efsun_kilidi', 1);
        if (key >= 10) ch.addMaterial('kutsama_kagidi', key >= 15 ? 2 : 1);
        if (rng.chance(0.2)) ch.addMaterial('kadim_efsun', 1);
      }
    } else {
      ch.addGold(150 * Math.max(1, ch.level));
    }
    // deposit items
    const p = G.player;
    for (const it of out) {
      if (!ch.addItem(it)) {
        if (p && G.world) this.dropItem(it, p.position);
        else if (this.clock - this.lastBagFull > 1) toast('Çantan dolu!', 'error');
      }
    }
    return out;
  }

  /** Vendor stock for the merchant UI (deterministic from `seed`). */
  vendorStock(level: number, seed: number): ItemInstance[] {
    const rng = new RNG((seed ^ hashString('vendor' + level)) >>> 0 || 1);
    const classId = G.character?.classId;
    const out: ItemInstance[] = [];
    const lvl = Math.max(1, Math.min(60, level));
    for (let i = 0; i < 12; i++) {
      const rarity: Rarity = rng.chance(0.72) ? 'common' : 'uncommon';
      // 8 of 12 for the buyer's class, the rest anything
      const item = generateItem({ itemLevel: lvl, rarity, classId: i < 8 ? classId : undefined, smart: i < 8 }, rng);
      out.push(item);
    }
    // keep a stable, tidy order: slot then rarity
    return out;
  }

  /**
   * Harvest a gather node (GDD_OPENWORLD 5.5): rolls its GATHER_TABLES entry, puts the result in the bag and returns it.
   * Unknown table ids return an empty list.
   */
  rollGather(tableId: string): { id: string; count: number }[] {
    const out: { id: string; count: number }[] = [];
    const ch = G.character;
    const table = GATHER_TABLES[tableId];
    if (!ch || !table) return out;
    for (const e of table.entries) {
      if (!this.rng.chance(e.chance)) continue;
      const count = this.rng.int(e.count[0], e.count[1]);
      if (count <= 0) continue;
      ch.addMaterial(e.id, count);
      out.push({ id: e.id, count });
    }
    return out;
  }

  /** Price of an item at the merchant (sell x4, GDD 6.4). */
  buyPrice(item: ItemInstance): number {
    return sellValue(item) * 4;
  }

  /** Remove all drops (scene change). */
  clear(): void {
    this.cancelTownScroll();
    for (const d of this.drops) {
      d.detachBeam();
      d.destroy();
    }
    this.drops.length = 0;
    this.chain = { count: 0, timer: 0, xp: 0, paid: 0 };
    this.myHits.clear();
  }

  /** Metin contributor rule (GDD_OPENWORLD 4.2): the local player hit this entity within the last 60 s. */
  contributed(entityId: number): boolean {
    const t = this.myHits.get(entityId);
    return t !== undefined && performance.now() / 1000 - t <= CONTRIBUTION_WINDOW_SEC;
  }

  /** Dev/testing: classes' display names are re-exported for the dev page. */
  static classNames = CLASS_NAMES_TR;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
