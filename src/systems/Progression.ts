import { G } from '../game/G';
import { emit, toast } from './notify';
import { addSkillMastery, announceLevelRanks, masteryRank, masteryXp } from './SkillMastery';
import { classPoints, specPoints } from './Talents';
import { siegeXpMult } from './SiegeRules';
import { LEVEL_CAP } from '../types/character';
import type { ClassId } from '../types/common';
import type { EnemyRank } from '../types/enemies';
import type { SkillSlotKey } from '../types/skills';
import { CLASSES } from '../data/classes';
import { DUNGEONS } from '../data/dungeons';
import { SKILLS } from '../data/skills';
import { CLASS_START_NODE, TALENT_NODES } from '../data/talents';

/** Passive points from "Kadim Bilgelik" quests (levels) and Mythic+ rating milestones (GDD 3.1). */
export const BONUS_POINT_LEVELS = [12, 22, 32, 42, 52, 60];
export const RATING_POINT_MILESTONES = [500, 1000, 1500, 2000, 2500];
/** GDD_TALENTS §3.8: the whole passive pool (59 levels + 6 quests + 5 rating + 19 milestone flags). */
export const PASSIVE_POINT_TOTAL = 89;
/** Pişmanlık Küresi (GDD_TALENTS §3.8): one orb refunds one passive node. */
const ORB_REGRET = 'orb_regret';

/** Default skill unlock levels in class order (GDD 2.0) when SkillDef.unlockLevel is unavailable. */
const DEFAULT_UNLOCKS = [1, 3, 6, 10, 15, 20, 25, 30];
const DEFAULT_SLOTS: (SkillSlotKey | null)[] = ['rmb', 'q', 'e', 's1', 's2', 's3', null, 'r'];

const xpMonsterBase = (L: number) => Math.round(5 + 1.2 * L ** 1.5);
const round10 = (n: number) => Math.round(n / 10) * 10;

/** Rank defaults used only when an enemy def gives no xp multiplier (GDD 6.2). */
const RANK_XP: Record<string, number> = { swarm: 0.35, trash: 1, elite: 5, miniboss: 25, boss: 100 };
/** F3 first-10-minutes pace: Sürü (swarm) monsters of level 1-10 give at least 0.6 (0.35 above level 10). */
const SWARM_EARLY_MULT = 0.6;
const SWARM_EARLY_MAX_LEVEL = 10;

/**
 * XP/levels, talent (passive tree) allocation and skill unlocks for the LOCAL character (G.character).
 * Emits 'player:xp', 'player:levelup', 'talents:changed'.
 * OWNER: items/progression module (tree data in data/talents.ts).
 */
export class Progression {
  constructor() {
    // GDD_TALENTS §3.8 passive milestones: first clears and first raid-boss kills (idempotent flags).
    // Region completion has no event yet: the world owner calls grantRegionMilestone(regionId).
    const ev = G.events;
    if (!ev) return;
    ev.on('run:completed', ({ state }) => this.onRunCompleted(state.failed, state.dungeonId, state.difficulty));
    ev.on('boss:defeated', ({ bossId }) => this.onBossDefeated(bossId));
  }

  // ------------------------------------------------------------------ xp
  /** XP needed to go from `level` to level+1 (Infinity at the level cap: show "MAKS."). */
  xpToNext(level: number): number {
    if (level >= LEVEL_CAP) return Infinity;
    const kills = 30 + 10 * level;
    return Math.max(10, round10(kills * xpMonsterBase(level)));
  }

  /** Cumulative XP needed to reach `level` from level 1 (tooltips / dev). */
  xpToReach(level: number): number {
    let sum = 0;
    for (let l = 1; l < Math.min(level, LEVEL_CAP); l++) sum += this.xpToNext(l);
    return sum;
  }

  /**
   * XP a monster gives (level difference penalty, rank multiplier).
   * `xpMult` is EnemyDef.xp: the monster's TOTAL multiplier vs a same-level Sıradan (it already includes its rank);
   * when it is <= 0/undefined the rank default (Sürü .35, Sıradan 1, Seçkin 5, Ara Patron 25, Patron 100) is used.
   * Sürü monsters of level 1-10 are floored at SWARM_EARLY_MULT (0.6), see tools/pace-check.mjs.
   */
  monsterXp(enemyLevel: number, rank: EnemyRank | 'swarm', xpMult: number, playerLevel: number): number {
    let mult = xpMult > 0 ? xpMult : RANK_XP[rank] ?? 1;
    if (rank === 'swarm' && enemyLevel <= SWARM_EARLY_MAX_LEVEL) mult = Math.max(mult, SWARM_EARLY_MULT);
    const d = playerLevel - enemyLevel;
    let diff = 1;
    if (d >= 8) diff = 0.05;
    else if (d === 7) diff = 0.2;
    else if (d === 6) diff = 0.4;
    else if (d === 5) diff = 0.6;
    else if (d === 4) diff = 0.8;
    else if (d < 0) diff = 1 + Math.min(0.25, 0.05 * -d);
    return Math.max(1, Math.round(xpMonsterBase(Math.max(1, enemyLevel)) * mult * diff));
  }

  /** Add XP to the local character (handles multi-level-ups). */
  addXp(amount: number): void {
    const ch = G.character;
    if (!ch || amount <= 0 || !isFinite(amount)) return;
    const save = ch.save;
    if (save.level >= LEVEL_CAP) return;
    // WP-14: the winning nation's Zafer buff (+5 % XP for one hour, local)
    const gained = Math.round(amount * siegeXpMult(save.siege?.zaferUntil));
    save.xp += gained;
    const levelsGained: number[] = [];
    while (save.level < LEVEL_CAP) {
      const need = this.xpToNext(save.level);
      if (save.xp < need) break;
      save.xp -= need;
      save.level++;
      levelsGained.push(save.level);
    }
    if (save.level >= LEVEL_CAP) save.xp = 0;
    if (levelsGained.length) this.onLevelUp(levelsGained);
    G.events.emit('player:xp', { gained, xp: save.xp, level: save.level, needed: this.xpToNext(save.level) });
    ch.persist();
  }

  /** Exploration XP (discoveries, vistas, first region entry): `pct` percent of the current level's xpToNext (GDD_OPENWORLD 5.8). */
  addExplorationXp(pct: number): void {
    const ch = G.character;
    if (!ch || !(pct > 0) || ch.level >= LEVEL_CAP) return;
    const xp = Math.round((pct / 100) * this.xpToNext(ch.level));
    if (xp > 0 && isFinite(xp)) this.addXp(xp);
  }

  /**
   * Open-world death penalty (GDD 6.6): from level 10 lose 5% of the current level's xpToNext, never de-level.
   * Returns the lost XP (0 inside dungeons / below level 10: the caller decides when it applies).
   */
  applyDeathPenalty(): number {
    const ch = G.character;
    if (!ch || ch.save.level < 10 || ch.save.level >= LEVEL_CAP) return 0;
    const loss = Math.min(ch.save.xp, Math.round(this.xpToNext(ch.save.level) * 0.05));
    if (loss <= 0) return 0;
    ch.save.xp -= loss;
    G.events.emit('player:xp', { gained: -loss, xp: ch.save.xp, level: ch.save.level, needed: this.xpToNext(ch.save.level) });
    ch.persist();
    return loss;
  }

  /** "Burada Diril" price (50 x level gold, GDD 6.6). */
  reviveHereCost(): number {
    return 50 * (G.character?.level ?? 1);
  }

  /** Dev/testing: jump to a level (no XP animation). */
  setLevel(level: number): void {
    const ch = G.character;
    if (!ch) return;
    const from = ch.save.level;
    ch.save.level = Math.max(1, Math.min(LEVEL_CAP, Math.floor(level)));
    ch.save.xp = 0;
    this.autoAssignSkills(from, ch.save.level, false);
    ch.recomputeStats();
    G.events.emit('player:xp', { gained: 0, xp: 0, level: ch.save.level, needed: this.xpToNext(ch.save.level) });
    ch.persist();
  }

  private onLevelUp(levels: number[]): void {
    const ch = G.character!;
    const from = levels[0] - 1;
    const to = levels[levels.length - 1];
    ch.recomputeStats();
    for (const l of levels) {
      G.events.emit('player:levelup', { level: l });
    }
    toast(`SEVİYE ${to}!`, 'levelup');
    // passive points gained (levels, quests and rating; the milestone flags toast on their own)
    const before = this.talentPointsAt(from, ch.save.mythic.rating);
    const after = this.talentPointsAt(to, ch.save.mythic.rating);
    if (after > before) toast(`+${after - before} pasif puan kazandın (${this.passivePointsTotal()}).`, 'levelup');
    // GDD_TALENTS §2.1: the class and spec pools of each level (pool totals at the new level)
    for (const l of levels) {
      if (classPoints(l) > classPoints(l - 1)) toast(`+1 Sınıf Puanı (${classPoints(l)}).`, 'levelup');
      if (specPoints(l) > specPoints(l - 1)) toast(`+1 Uzmanlık Puanı (${specPoints(l)}).`, 'levelup');
    }
    if (levels.includes(10) && !ch.save.spec) toast('Uzmanlık seçme zamanı!', 'levelup');
    // skill mastery tiers that open by the level catch-up (§4.2)
    announceLevelRanks(ch.classId, from, to);
    // new skills
    this.autoAssignSkills(from, to, true);
    // full heal + resource refill
    const p = G.player;
    if (p && !p.removed) {
      try {
        p.level = to;
        p.refreshStats();
        p.hp = p.maxHp;
        if (ch.classId !== 'barbarian') p.resource = p.maxResource;
      } catch (e) {
        console.warn('[progression] level-up heal failed', e);
      }
    }
  }

  /** Assign skills unlocked between two levels to their default slots (if free). */
  private autoAssignSkills(fromLevel: number, toLevel: number, announce: boolean): void {
    const ch = G.character;
    if (!ch) return;
    const def = CLASSES[ch.classId];
    const ids = def?.skills ?? [];
    ids.forEach((id, i) => {
      const unlock = SKILLS[id]?.unlockLevel ?? DEFAULT_UNLOCKS[i] ?? 99;
      if (unlock <= fromLevel || unlock > toLevel) return;
      const slot = SKILLS[id]?.defaultSlot ?? DEFAULT_SLOTS[i];
      if (slot && !ch.save.skillBar[slot]) {
        ch.save.skillBar[slot] = id;
        G.events.emit('skillbar:changed', {});
        if (announce) toast(`Yeni beceri öğrendin: ${SKILLS[id]?.name ?? id}`, 'levelup');
      } else if (announce) {
        toast(`Yeni beceri öğrendin! Yetenek Kitabı'ndan (K) bir yuvaya sürükle: ${SKILLS[id]?.name ?? id}`, 'levelup');
      }
    });
  }

  /**
   * Skill ids unlocked for a class at a level, in unlock order. The local character's granted skills (taken `A` nodes of
   * the active spec, GDD_TALENTS §2.3) come after them when the class is the character's own.
   */
  unlockedSkills(classId: ClassId, level: number): string[] {
    const ids = CLASSES[classId]?.skills ?? [];
    const base = ids.filter((id, i) => (SKILLS[id]?.unlockLevel ?? DEFAULT_UNLOCKS[i] ?? 99) <= level);
    if (G.character?.classId !== classId) return base;
    const granted = G.talents?.grantedSkills() ?? [];
    return base.concat(granted.filter((id) => !base.includes(id)));
  }

  // ------------------------------------------------------------------ skill mastery (GDD_TALENTS §4.2)
  /** Awards mastery XP to a skill after a cast that hit or helped a target (SkillSystem; see SkillMastery.addSkillMastery). */
  addSkillMastery(skillId: string, baseXp: number): void {
    addSkillMastery(skillId, baseXp);
  }

  /** Mastery XP of a skill on the local character. */
  skillMasteryXp(skillId: string): number {
    return masteryXp(skillId);
  }

  /** Mastery tier rank (0–3) of a skill on the local character. */
  skillMasteryRank(skillId: string): number {
    return masteryRank(skillId);
  }

  skillUnlockLevel(classId: ClassId, skillId: string): number {
    const ids = CLASSES[classId]?.skills ?? [];
    const i = ids.indexOf(skillId);
    return SKILLS[skillId]?.unlockLevel ?? DEFAULT_UNLOCKS[i] ?? 1;
  }

  // ------------------------------------------------------------------ passive tree
  private talentPointsAt(level: number, rating: number): number {
    let n = Math.max(0, level - 1);
    for (const l of BONUS_POINT_LEVELS) if (level >= l) n++;
    for (const r of RATING_POINT_MILESTONES) if (rating >= r) n++;
    return n;
  }

  /** Passive pool of the web: levels, quests and rating (talentPointsAt) plus the milestone flags, capped at 89. */
  talentPointsTotal(): number {
    return this.passivePointsTotal();
  }

  /** GDD_TALENTS §3.8: talentPointsAt + one per `pp.*` flag (dungeon clears, regions, raid bosses), at most 89. */
  passivePointsTotal(): number {
    const ch = G.character;
    if (!ch) return 0;
    let milestones = 0;
    for (const key of Object.keys(ch.save.flags)) if (key.startsWith('pp.') && ch.save.flags[key]) milestones++;
    return Math.min(PASSIVE_POINT_TOTAL, this.talentPointsAt(ch.save.level, ch.save.mythic.rating) + milestones);
  }

  /**
   * Grants one passive point for a milestone flag (`pp.dun.<id>.<n|h>`, `pp.reg.<id>`, `pp.raid.<id>`). Idempotent:
   * the flag is set once. Returns true when the point was granted now.
   */
  grantPassiveMilestone(flag: string): boolean {
    const ch = G.character;
    if (!ch || !flag.startsWith('pp.') || ch.save.flags[flag]) return false;
    ch.save.flags[flag] = 1;
    toast(`+1 pasif puan kazandın (${this.passivePointsTotal()}).`, 'levelup');
    emit('passives:changed', {});
    ch.persist();
    return true;
  }

  /** Region completion (GDD_TALENTS §3.8 Bölge Kaşifi): called by the world owner, which owns the completion rule. */
  grantRegionMilestone(regionId: string): boolean {
    return this.grantPassiveMilestone(`pp.reg.${regionId}`);
  }

  /** First clear of a dungeon on Normal or Kahramanlık (Zindan Fethi, §3.8). Other difficulties and raids do not count. */
  private onRunCompleted(failed: boolean, dungeonId: string, difficulty: string): void {
    if (failed) return;
    const def = DUNGEONS[dungeonId];
    if (!def || def.raid) return;
    if (difficulty !== 'normal' && difficulty !== 'heroic') return;
    this.grantPassiveMilestone(`pp.dun.${dungeonId}.${difficulty === 'normal' ? 'n' : 'h'}`);
  }

  /** First kill of a raid boss on any difficulty (Efsun Kalesi ilk ölüm, §3.8). */
  private onBossDefeated(bossId: string): void {
    const isRaidBoss = Object.values(DUNGEONS).some((d) => d.raid?.bossOrder.includes(bossId));
    if (isRaidBoss) this.grantPassiveMilestone(`pp.raid.${bossId}`);
  }

  /** Points spent: every allocated node except the class's own (free) start. */
  talentPointsSpent(): number {
    const ch = G.character;
    if (!ch) return 0;
    return ch.save.talents.filter((id) => TALENT_NODES[id] && TALENT_NODES[id].classStart !== ch.classId).length;
  }

  talentPointsAvailable(): number {
    return Math.max(0, this.talentPointsTotal() - this.talentPointsSpent());
  }

  isAllocated(nodeId: string): boolean {
    return !!G.character?.save.talents.includes(nodeId);
  }

  /** A node can be allocated when it exists, is free, adjacent to an allocated node, and a point is available. */
  canAllocate(nodeId: string): boolean {
    const ch = G.character;
    const node = TALENT_NODES[nodeId];
    if (!ch || !node) return false;
    if (ch.save.talents.includes(nodeId)) return false;
    if (node.classStart === ch.classId) return false;
    if (this.talentPointsAvailable() < 1) return false;
    return node.links.some((l) => ch.save.talents.includes(l));
  }

  allocate(nodeId: string): boolean {
    const ch = G.character;
    if (!ch || !this.canAllocate(nodeId)) return false;
    ch.save.talents.push(nodeId);
    ch.recomputeStats();
    G.events.emit('talents:changed', {});
    ch.persist();
    return true;
  }

  /** Shortest chain of nodes (excluding allocated ones) to reach `nodeId` from the allocated set (BFS). Null if unreachable. */
  pathTo(nodeId: string): string[] | null {
    const ch = G.character;
    if (!ch || !TALENT_NODES[nodeId]) return null;
    const have = new Set(ch.save.talents);
    if (have.has(nodeId)) return [];
    const prev = new Map<string, string | null>();
    const queue: string[] = [];
    for (const id of have) {
      prev.set(id, null);
      queue.push(id);
    }
    while (queue.length) {
      const cur = queue.shift()!;
      if (cur === nodeId) break;
      for (const l of TALENT_NODES[cur]?.links ?? []) {
        if (prev.has(l) || !TALENT_NODES[l]) continue;
        if (TALENT_NODES[l].classStart === ch.classId) continue;
        prev.set(l, cur);
        queue.push(l);
      }
    }
    if (!prev.has(nodeId)) return null;
    const path: string[] = [];
    let c: string | null = nodeId;
    while (c && !have.has(c)) {
      path.unshift(c);
      c = prev.get(c) ?? null;
    }
    return path;
  }

  /** Points needed to reach a node (BFS path length) or Infinity. */
  pathCost(nodeId: string): number {
    const p = this.pathTo(nodeId);
    return p ? p.length : Infinity;
  }

  /** Would the allocated set stay connected to the class start without `nodeId`? */
  private stillConnectedWithout(nodeId: string): boolean {
    const ch = G.character!;
    const start = CLASS_START_NODE[ch.classId];
    const set = new Set(ch.save.talents);
    set.delete(nodeId);
    const seen = new Set<string>([start]);
    const queue = [start];
    while (queue.length) {
      const cur = queue.shift()!;
      for (const l of TALENT_NODES[cur]?.links ?? []) if (set.has(l) && !seen.has(l)) {
        seen.add(l);
        queue.push(l);
      }
    }
    for (const id of set) if (TALENT_NODES[id] && !seen.has(id)) return false;
    return true;
  }

  canRefund(nodeId: string): boolean {
    const ch = G.character;
    const node = TALENT_NODES[nodeId];
    if (!ch || !node || !ch.save.talents.includes(nodeId)) return false;
    if (node.classStart === ch.classId) return false;
    return this.stillConnectedWithout(nodeId);
  }

  /** Gold cost to refund one node at the trainer (25 x level). */
  refundCost(): number {
    return 25 * (G.character?.level ?? 1);
  }

  /** Refund a single node (gold, only if the tree stays connected). */
  refundNode(nodeId: string): boolean {
    const ch = G.character;
    if (!ch || !this.canRefund(nodeId)) return false;
    if (!this.roomForJewels([nodeId])) {
      toast('Çantan dolu!', 'error');
      return false;
    }
    if (!ch.spendGold(this.refundCost())) {
      toast('Yeterli altının yok.', 'error');
      return false;
    }
    this.dropWebNodes([nodeId]);
    this.afterWebChange();
    return true;
  }

  /**
   * Pişmanlık Küresi (GDD_TALENTS §3.8): refunds one node for one `orb_regret`, anywhere out of combat and outside a
   * dungeon run (CharacterState.webEditReason). Same connectivity rule as the gold refund; a socket's jewel returns.
   */
  refundNodeOrb(nodeId: string): boolean {
    const ch = G.character;
    if (!ch) return false;
    const reason = ch.webEditReason();
    if (reason) {
      toast(reason, 'error');
      return false;
    }
    if (!this.canRefund(nodeId)) return false;
    if (!this.roomForJewels([nodeId])) {
      toast('Çantan dolu!', 'error');
      return false;
    }
    if (ch.material(ORB_REGRET) < 1) {
      toast('Pişmanlık Küresi yok.', 'error');
      return false;
    }
    ch.useMaterial(ORB_REGRET, 1);
    this.dropWebNodes([nodeId]);
    this.afterWebChange();
    return true;
  }

  /** Bag room for the jewels sitting in the sockets of `nodeIds` (they return to the bag when the node goes). */
  private roomForJewels(nodeIds: readonly string[]): boolean {
    const save = G.character?.save;
    if (!save) return false;
    const jewels = nodeIds.filter((id) => !!save.passiveExtra?.jewels?.[id]).length;
    return save.bag.filter((x) => !x).length >= jewels;
  }

  /** Removes web nodes from the save: a socket's jewel goes back to the bag, a mastery pick is forgotten. */
  private dropWebNodes(nodeIds: readonly string[]): void {
    const ch = G.character;
    if (!ch) return;
    const pe = ch.save.passiveExtra;
    for (const id of nodeIds) {
      const jewel = pe?.jewels?.[id];
      if (pe && jewel) {
        pe.jewels[id] = null;
        ch.addItem(jewel);
      }
      if (pe) delete pe.picks[id];
    }
    ch.save.talents = ch.save.talents.filter((t) => !nodeIds.includes(t));
  }

  private afterWebChange(): void {
    const ch = G.character;
    if (!ch) return;
    ch.recomputeStats();
    G.events.emit('talents:changed', {});
    emit('passives:changed', {});
    ch.persist();
  }

  /** Gold for the full reset: the first one is free, then 1,000 x level. */
  refundAllCost(): number {
    const ch = G.character;
    if (!ch) return 0;
    return ch.save.talentRefunds <= 0 ? 0 : 1000 * ch.level;
  }

  /** Full respec ("Kadim Unutuş Parşömeni"). Returns false when the gold is missing or nothing is allocated. */
  refundAll(): boolean {
    const ch = G.character;
    if (!ch) return false;
    if (this.talentPointsSpent() === 0) return false;
    if (!this.roomForJewels(ch.save.talents)) {
      toast('Çantan dolu!', 'error');
      return false;
    }
    const cost = this.refundAllCost();
    if (cost > 0 && !ch.spendGold(cost)) {
      toast('Yeterli altının yok.', 'error');
      return false;
    }
    this.dropWebNodes(ch.save.talents.filter((id) => id !== CLASS_START_NODE[ch.classId]));
    ch.save.talents = [CLASS_START_NODE[ch.classId]];
    ch.save.talentRefunds++;
    this.afterWebChange();
    return true;
  }
}
