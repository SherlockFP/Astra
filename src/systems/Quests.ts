import { G } from '../game/G';
import type { Enemy } from '../entities/Enemy';
import type { EnemyRank } from '../types/enemies';
import type { ItemCategory, ItemInstance } from '../types/items';
import type { QuestDef, QuestKind, QuestObjective, QuestState } from '../types/quests';
import { RNG } from '../core/utils';
import { MATERIALS } from '../data/materials';
import { QUESTS } from '../data/world/quests';
import { AV_DEFTERI, AV_DELIVERY_COOLDOWN_MS, AV_TROPHY_CHANCE, AV_TROPHY_CHANCE_SWARM, type AvDefteriStep } from '../data/avDefteri';
import { categoriesForClass } from './ItemGen';
import { toast } from './notify';

/**
 * Open-world quest runtime (GDD_OPENWORLD 6.1-6.7). OWNER: items module. Exposed as `G.quests` (created by LootSystem's
 * constructor when Game.ts has not done it).
 *
 * - Definitions are data (types/quests.ts). Register them with `registerDefs(list)` (content / world boot code).
 * - Progress lives in `CharacterSave.flags`: `q.<id>` = 'active' | 'done', `q.<id>.n<k>` = progress of objective k.
 *   `collect` progress is read from the bag (quest items are materials) and consumed on turn-in.
 * - Kill / boss / metin progress is counted per peer for its own player from `G.loot.onEnemyKilled` (every peer
 *   runs it for its own player), so party members progress without extra net traffic.
 * - Quest drops (`collect` items, Av Defteri trophies) are rolled by LootSystem through `rollDrops()`.
 * - Av Defteri (6.4) is a repeatable collection that gives permanent stats (StatCalc reads `world.bio`).
 */

/** One killed enemy, as seen by the local player's quest counter. */
export interface QuestKillInfo {
  enemyId: string;
  /** Enemy family (objective `kill` may target a family instead of an id). */
  family?: string;
  rank?: EnemyRank;
  /** Kill came from a swarm member (lower drop chances). */
  swarm?: boolean;
  /** Region of the camp / patrol ("r1"), when known. */
  regionId?: string;
}

/** Quest or Av Defteri item rolled as a drop for one kill. */
export interface QuestDrop {
  id: string;
  count: number;
}

/** One objective row for the tracker / questlog. */
export interface QuestObjectiveRow {
  kind: QuestKind;
  text: string;
  have: number;
  need: number;
  done: boolean;
}

/** Av Defteri status for the collector NPC dialog. */
export interface AvDefteriStatus {
  completed: number;
  total: number;
  /** Step being collected (null = none). */
  active: AvDefteriStep | null;
  /** Next step (null when all six are done). */
  next: AvDefteriStep | null;
  /** Trophies in the bag for the active step. */
  have: number;
  /** Seconds until the next delivery (0 = now). */
  cooldownSec: number;
  canAccept: boolean;
  canDeliver: boolean;
}

/** Chance per kill that a `collect` item drops while its quest is active (swarm: lower). */
const COLLECT_CHANCE = 0.4;
const COLLECT_CHANCE_SWARM = 0.15;
const KILL_KINDS: readonly QuestKind[] = ['kill', 'boss', 'metin', 'elite'];
/** Bag-based objectives: progress is the number of items in the bag and they are consumed on turn-in. */
const BAG_KINDS: readonly QuestKind[] = ['collect', 'drop'];

/** Generic reward slots -> item categories (intersected with the class's usable categories). */
const SLOT_GROUPS: Record<'weapon' | 'armor' | 'jewelry', ItemCategory[]> = {
  weapon: ['sword1h', 'sword2h', 'axe1h', 'axe2h', 'mace', 'staff', 'wand', 'dagger', 'crossbow', 'bow'],
  armor: ['helm', 'shoulders', 'chest', 'gloves', 'legs', 'boots', 'shield'],
  jewelry: ['ring', 'amulet', 'belt'],
};

const qKey = (id: string) => `q.${id}`;
const pKey = (id: string, k: number) => `q.${id}.n${k}`;
/** Turn-in day of a daily quest (local calendar day). */
const qDay = (id: string) => `q.${id}.day`;
const dayKey = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

export class QuestSystem {
  private defs = new Map<string, QuestDef>();
  private order: string[] = [];
  private lastSig = new Map<string, string>();
  private sigOwner: string | undefined;
  private rng = new RNG(((Date.now() ^ (Math.random() * 2 ** 32)) >>> 0) || 1);
  private warned = new Set<string>();
  /** Choice-reward options rolled for ready quests (one set per quest, dropped on turn-in). */
  private choiceRolls = new Map<string, ItemInstance[]>();

  constructor() {
    // Sisli Vadi quest data (content module, data/world/quests.ts); more defs can be added with registerDefs()
    this.registerDefs(QUESTS);
    const ev = G.events;
    if (!ev) return;
    ev.on('run:completed', ({ state }) => {
      if (!state || state.failed) return;
      this.onEvent('dungeon', `${state.dungeonId}:${state.difficulty}`);
    });
    ev.on('world:regionEntered', ({ regionId }) => this.onEvent('explore', regionId));
    ev.on('waypoint:discovered', ({ id }) => this.onEvent('explore', id));
    ev.on('enemy:castEnd', ({ enemyId, interrupted, interruptedBy }) => {
      if (!interrupted) return;
      // only the local player's interrupts count; an unknown interrupter (undefined) is accepted
      if (interruptedBy !== undefined && interruptedBy !== G.player?.id) return;
      const defId = (G.world?.entities.get(enemyId) as Enemy | undefined)?.def?.id;
      this.onInterrupt(defId);
    });
    // collect objectives follow the bag; quest items can also be bought or dropped by other systems
    ev.on('materials:changed', () => this.refreshLive());
    // level-ups can unlock quests (level gate): announce the ones that became available
    ev.on('player:levelup', () => {
      for (const d of this.all()) this.notify(d);
    });
  }

  // ======================================================================== definitions
  /** Register quest definitions (boot code). Re-registering an id replaces its definition. */
  registerDefs(defs: readonly QuestDef[]): void {
    for (const d of defs) {
      if (!this.defs.has(d.id)) this.order.push(d.id);
      this.defs.set(d.id, d);
    }
    this.lastSig.clear();
  }

  /** Every registered quest, in registration order. */
  all(): QuestDef[] {
    return this.order.map((id) => this.defs.get(id)).filter((d): d is QuestDef => !!d);
  }

  /** Definition of one quest (undefined when unknown). */
  def(questId: string): QuestDef | undefined {
    return this.defs.get(questId);
  }

  // ======================================================================== state
  private isDone(id: string): boolean {
    return G.character?.save.flags[qKey(id)] === 'done';
  }

  /** A daily quest turned in on an earlier local day is offered again (it counts as not done). */
  private dailyDue(def: QuestDef): boolean {
    return !!def.daily && G.character?.save.flags[qDay(def.id)] !== dayKey();
  }

  /** Progress of objective k: collect reads the bag, the rest read the save flags. */
  private progressAt(def: QuestDef, k: number): number {
    const ch = G.character;
    const o = def.objectives[k];
    if (!ch || !o) return 0;
    if (BAG_KINDS.includes(o.kind)) return o.target ? Math.min(o.count, ch.material(o.target)) : 0;
    return Math.min(o.count, Number(ch.save.flags[pKey(def.id, k)] ?? 0));
  }

  private objectivesDone(def: QuestDef): boolean {
    return def.objectives.every((o, k) => this.progressAt(def, k) >= o.count);
  }

  private stateOf(def: QuestDef): QuestState {
    const ch = G.character;
    if (!ch) return 'locked';
    const v = ch.save.flags[qKey(def.id)];
    if (v === 'done' && !this.dailyDue(def)) return 'done';
    if (v === 'active') return this.objectivesDone(def) ? 'ready' : 'active';
    if (ch.level < def.level) return 'locked';
    if (def.prereq?.some((p) => !this.isDone(p))) return 'locked';
    return 'available';
  }

  /** Current state of a quest for the local character. Unknown ids are 'locked'. */
  state(questId: string): QuestState {
    const def = this.defs.get(questId);
    return def ? this.stateOf(def) : 'locked';
  }

  /** Quests currently 'active' or 'ready' (questlog / tracker). */
  /** True while an active quest still has an unfinished objective of `kind` on `target` (world props check this before counting). */
  wants(kind: QuestKind, target: string): boolean {
    return this.active().some((d) => d.objectives.some((o, k) => o.kind === kind && o.target === target && this.progressAt(d, k) < o.count));
  }

  active(): QuestDef[] {
    return this.all().filter((d) => {
      const s = this.stateOf(d);
      return s === 'active' || s === 'ready';
    });
  }

  /** Quests this NPC (TownNpc id) offers ('available' + giver) or turns in ('ready' + turnIn ?? giver). */
  offered(npcId: string): QuestDef[] {
    const out: QuestDef[] = [];
    for (const d of this.all()) {
      const s = this.stateOf(d);
      if (s === 'available' && d.giver === npcId) out.push(d);
      else if (s === 'ready' && (d.turnIn ?? d.giver) === npcId) out.push(d);
    }
    return out;
  }

  /** Objective rows of a quest for the tracker / questlog. */
  progressRows(questId: string): QuestObjectiveRow[] {
    const def = this.defs.get(questId);
    if (!def) return [];
    return def.objectives.map((o, k) => {
      const have = this.progressAt(def, k);
      return { kind: o.kind, text: o.text, have, need: o.count, done: have >= o.count };
    });
  }

  // ======================================================================== accept / turn in
  /** Accept an 'available' quest. Returns false when it is not available. */
  accept(questId: string): boolean {
    const def = this.defs.get(questId);
    const ch = G.character;
    if (!def || !ch || this.stateOf(def) !== 'available') return false;
    ch.save.flags[qKey(def.id)] = 'active';
    def.objectives.forEach((o, k) => {
      // discoveries fire once per character: a place found before the quest was taken counts as explored
      const f = ch.save.flags;
      const known = o.kind === 'explore' && !!o.target && !!(f[`world.found.${o.target}`] || f[`world.region.${o.target}`] || f[`world.wp.${o.target}`]);
      f[pKey(def.id, k)] = known ? o.count : 0;
    });
    for (const it of def.startItems ?? []) if (MATERIALS[it.id]) ch.addMaterial(it.id, it.count);
    ch.persist();
    this.notify(def, true);
    toast(`Görev alındı: ${def.name}`, 'info');
    return true;
  }

  /** Turn in a 'ready' quest and pay the reward. `pick` is the index of the item the player takes from choiceOptions (choice quests only). Returns false when it is not ready or no valid pick is given. */
  turnIn(questId: string, pick?: number): boolean {
    const def = this.defs.get(questId);
    const ch = G.character;
    if (!def || !ch || this.stateOf(def) !== 'ready') return false;
    let chosen: ItemInstance | undefined;
    if (def.reward.choice) {
      chosen = pick === undefined ? undefined : this.choiceOptions(questId)[pick];
      if (!chosen) return false;
    }
    // flag first: the materials listener must not announce 'ready' again while the items are consumed
    ch.save.flags[qKey(def.id)] = 'done';
    if (def.daily) ch.save.flags[qDay(def.id)] = dayKey();
    def.objectives.forEach((o, k) => {
      if (BAG_KINDS.includes(o.kind) && o.target) ch.useMaterial(o.target, o.count);
      delete ch.save.flags[pKey(def.id, k)];
    });
    this.grantRewards(def, chosen);
    this.choiceRolls.delete(questId);
    for (const u of def.unlocks ?? []) if (!this.defs.has(u)) ch.save.flags[u] = true;
    ch.persist(true);
    this.notify(def, true);
    toast(`Görev tamamlandı: ${def.name}`, 'success');
    // quests whose prerequisite was this one may now be available
    for (const other of this.all()) if (other.prereq?.includes(def.id)) this.notify(other);
    return true;
  }

  /** The items a choice quest offers at turn-in: one class-appropriate item per slot, rolled once per ready state. Empty when not ready or no choice. */
  choiceOptions(questId: string): ItemInstance[] {
    const def = this.defs.get(questId);
    const choice = def?.reward.choice;
    if (!def || !choice || this.stateOf(def) !== 'ready') return [];
    let opts = this.choiceRolls.get(questId);
    if (!opts) {
      opts = choice.slots.map((slot) => this.rollGeneric(def, { rarity: choice.rarity, slot })).filter((it): it is ItemInstance => it !== null);
      this.choiceRolls.set(questId, opts);
    }
    return opts;
  }

  private grantRewards(def: QuestDef, chosen?: ItemInstance): void {
    const ch = G.character;
    if (!ch) return;
    const r = def.reward;
    const xp = Math.round((r.xpPct / 100) * G.progression.xpToNext(def.level));
    if (xp > 0 && isFinite(xp)) G.progression.addXp(xp);
    if (r.goldPerLevel) ch.addGold(r.goldPerLevel * def.level);
    for (const it of r.items ?? []) {
      if (MATERIALS[it.id]) ch.addMaterial(it.id, it.count);
      else this.warnOnce(`reward:${it.id}`, `[quests] reward "${it.id}" of ${def.id} is not a material`);
    }
    for (const g of r.generic ?? []) this.giveGenericItem(def, g);
    if (chosen) this.giveItem(chosen);
  }

  private giveGenericItem(def: QuestDef, g: { rarity: 'uncommon' | 'rare' | 'epic'; slot?: 'weapon' | 'armor' | 'jewelry' }): void {
    const item = this.rollGeneric(def, g);
    if (item) this.giveItem(item);
  }

  /** Rolls a bound item of the quest's level for the local class; a slot group limits the category. Null without loot or character. */
  private rollGeneric(def: QuestDef, g: { rarity: 'uncommon' | 'rare' | 'epic'; slot?: 'weapon' | 'armor' | 'jewelry' }): ItemInstance | null {
    const loot = G.loot;
    const ch = G.character;
    if (!loot || !ch) return null;
    let category: ItemCategory | undefined;
    if (g.slot) {
      const allowed = new Set<ItemCategory>(categoriesForClass(ch.classId));
      const pool = SLOT_GROUPS[g.slot].filter((c) => allowed.has(c));
      if (pool.length) category = this.rng.pick(pool);
    }
    return loot.rollItem({ itemLevel: Math.max(1, def.level), rarity: g.rarity, classId: ch.classId, category, bound: true });
  }

  /** Bag first; a full bag drops the item at the player's feet. */
  private giveItem(item: ItemInstance): void {
    const loot = G.loot;
    const ch = G.character;
    if (!loot || !ch) return;
    if (!ch.addItem(item) && G.player) loot.dropItem(item, G.player.position);
  }

  // ======================================================================== progress
  /** Adds `amount` to one objective (clamped to its count) and announces the change. */
  private bump(def: QuestDef, k: number, amount: number): void {
    const ch = G.character;
    const o = def.objectives[k];
    if (!ch || !o || BAG_KINDS.includes(o.kind)) return;
    const cur = Number(ch.save.flags[pKey(def.id, k)] ?? 0);
    if (cur >= o.count) return;
    ch.save.flags[pKey(def.id, k)] = Math.min(o.count, cur + amount);
    ch.persist();
    this.notify(def);
  }

  /** Emits 'quest:updated' when the state or total progress changed; toasts when a quest becomes ready. */
  private notify(def: QuestDef, force = false): void {
    // the change cache belongs to one character: forget it when another character is selected
    const owner = G.character?.save.id;
    if (owner !== this.sigOwner) {
      this.sigOwner = owner;
      this.lastSig.clear();
    }
    const state = this.stateOf(def);
    if (state === 'locked') return;
    const progress = def.objectives.reduce((s, _, k) => s + this.progressAt(def, k), 0);
    const sig = `${state}:${progress}`;
    if (!force && this.lastSig.get(def.id) === sig) return;
    const prevSig = this.lastSig.get(def.id);
    this.lastSig.set(def.id, sig);
    G.events?.emit('quest:updated', { questId: def.id, state, progress });
    if (state === 'ready' && prevSig !== undefined && !prevSig.startsWith('ready:')) toast(`Görev hazır: ${def.name}`, 'success');
  }

  /** Live refresh (materials changed): re-announce quests that are running. */
  private refreshLive(): void {
    if (!G.character) return;
    for (const def of this.all()) {
      const s = this.stateOf(def);
      if (s === 'active' || s === 'ready') this.notify(def);
    }
  }

  private matchKill(o: QuestObjective, info: QuestKillInfo): boolean {
    const t = o.target;
    switch (o.kind) {
      case 'kill':
        return !t || info.enemyId === t || info.family === t;
      case 'boss':
        return t ? info.enemyId === t : info.rank === 'boss' || info.rank === 'miniboss';
      case 'metin':
        return t ? info.enemyId === t || info.family === t : info.family === 'metin';
      case 'elite':
        // named: the target id is required, and trash never counts (a rare / miniboss / boss stands in for an elite)
        return !!t && info.enemyId === t && info.rank !== 'trash';
      default:
        return false;
    }
  }

  /** Enemy died (host or client, local player's own counter). Called by LootSystem.onEnemyKilled on every peer. */
  onKill(info: QuestKillInfo): void {
    if (!G.character) return;
    for (const def of this.all()) {
      if (this.stateOf(def) !== 'active') continue;
      def.objectives.forEach((o, k) => {
        if (KILL_KINDS.includes(o.kind) && this.matchKill(o, info)) this.bump(def, k, 1);
      });
    }
  }

  /**
   * Non-kill objective event: talk (npcId), explore (placeId), skill, metin (tierId), dungeon (id[:difficulty]),
   * interact (world object id, one per interaction).
   * An objective without target matches any event of its kind; `dungeon` objectives without a difficulty match any difficulty.
   */
  onEvent(kind: QuestKind, target: string, count = 1): void {
    if (!G.character || kind === 'collect') return;
    for (const def of this.all()) {
      if (this.stateOf(def) !== 'active') continue;
      def.objectives.forEach((o, k) => {
        if (o.kind !== kind) return;
        if (o.target && o.target !== target && !target.startsWith(o.target + ':')) return;
        this.bump(def, k, Math.max(1, count));
      });
    }
  }

  /** A cast was interrupted by the local player: `defId` is the caster's enemy def id (when known). */
  private onInterrupt(defId: string | undefined): void {
    if (!G.character) return;
    for (const def of this.all()) {
      if (this.stateOf(def) !== 'active') continue;
      def.objectives.forEach((o, k) => {
        if (o.kind !== 'skill') return;
        if (o.target && o.target !== 'interrupt' && o.target !== defId) return;
        this.bump(def, k, 1);
      });
    }
  }

  /**
   * Quest item used on a target (place / npc / object id): one item is consumed per use of an active `use` objective.
   * Returns false when the bag has no such item or no active objective takes it on that target.
   */
  useItem(itemId: string, targetId: string): boolean {
    const ch = G.character;
    if (!ch || ch.material(itemId) < 1) return false;
    let used = false;
    for (const def of this.all()) {
      if (this.stateOf(def) !== 'active') continue;
      def.objectives.forEach((o, k) => {
        if (o.kind !== 'use' || o.item !== itemId || (o.target && o.target !== targetId)) return;
        if (this.progressAt(def, k) >= o.count || ch.material(itemId) < 1) return;
        ch.useMaterial(itemId, 1);
        this.bump(def, k, 1);
        used = true;
      });
    }
    return used;
  }

  /**
   * Escort objective tick: `seconds` survived beside the escorted NPC (call about once a second). `alive` false = the NPC fell,
   * which resets the escort timer of every active escort objective (the quest stays active).
   */
  tickEscort(seconds: number, alive: boolean): void {
    const ch = G.character;
    if (!ch || !(seconds > 0)) return;
    for (const def of this.all()) {
      if (this.stateOf(def) !== 'active') continue;
      def.objectives.forEach((o, k) => {
        if (o.kind !== 'escort') return;
        const cur = Number(ch.save.flags[pKey(def.id, k)] ?? 0);
        if (cur >= o.count) return;
        if (alive) return this.bump(def, k, seconds);
        if (cur <= 0) return;
        ch.save.flags[pKey(def.id, k)] = 0;
        ch.persist();
        this.notify(def);
      });
    }
  }

  /** Shared progress bar of a quest in 0..100: the mean of its objectives' progress (bonus objectives mix kinds). */
  progressPct(questId: string): number {
    const def = this.defs.get(questId);
    if (!def || !def.objectives.length) return 0;
    const sum = def.objectives.reduce((s, o, k) => s + Math.min(1, this.progressAt(def, k) / o.count), 0);
    return Math.round((100 * sum) / def.objectives.length);
  }

  // ======================================================================== drops
  /** Source rule of a collect item: the quest's kill objectives, else its region, else any kill. */
  private sourceMatches(def: QuestDef, info: QuestKillInfo): boolean {
    const kills = def.objectives.filter((o) => KILL_KINDS.includes(o.kind));
    if (kills.length) return kills.some((o) => this.matchKill(o, info));
    if (def.region) return info.regionId === def.region;
    return true;
  }

  private activeAvStep(): AvDefteriStep | null {
    const ch = G.character;
    if (!ch) return null;
    const active = Number(ch.save.flags['world.bio.active'] ?? 0);
    if (!active || active <= this.bioCompleted()) return null;
    return AV_DEFTERI.find((s) => s.step === active) ?? null;
  }

  /**
   * Quest and Av Defteri items that drop from one kill (called by LootSystem for kills in loot range).
   * collect items drop only while their quest is active and the bag has fewer than `count`.
   */
  rollDrops(info: QuestKillInfo): QuestDrop[] {
    const out: QuestDrop[] = [];
    const ch = G.character;
    if (!ch) return out;
    for (const def of this.all()) {
      if (this.stateOf(def) !== 'active') continue;
      for (const o of def.objectives) {
        if (!BAG_KINDS.includes(o.kind) || !o.target) continue;
        if (ch.material(o.target) >= o.count) continue;
        if (o.kind === 'drop' && o.from?.length) {
          if (!o.from.some((id) => info.enemyId === id || info.family === id)) continue;
        } else if (!this.sourceMatches(def, info)) continue;
        // drop: its own chance; collect: the shared chance. Swarm members scale both down by the collect ratio.
        const base = o.kind === 'drop' && o.chance !== undefined ? o.chance : COLLECT_CHANCE;
        const chance = info.swarm ? base * (COLLECT_CHANCE_SWARM / COLLECT_CHANCE) : base;
        if (this.rng.chance(chance)) out.push({ id: o.target, count: 1 });
      }
    }
    const step = this.activeAvStep();
    if (step) {
      const hit = !!info.family && !!step.sources.families?.includes(info.family) || !!step.sources.ids?.includes(info.enemyId);
      if (hit && this.rng.chance(info.swarm ? AV_TROPHY_CHANCE_SWARM : AV_TROPHY_CHANCE)) out.push({ id: step.item, count: 1 });
    }
    return out;
  }

  // ======================================================================== Av Defteri (GDD 6.4)
  /** Steps delivered so far (0..6). */
  bioCompleted(): number {
    const v = Number(G.character?.save.flags['world.bio'] ?? 0);
    return Math.max(0, Math.min(AV_DEFTERI.length, Math.floor(v)));
  }

  /** Status for the collector NPC dialog. */
  bioStatus(): AvDefteriStatus {
    const ch = G.character;
    const completed = this.bioCompleted();
    const active = this.activeAvStep();
    const next = AV_DEFTERI.find((s) => s.step === completed + 1) ?? null;
    const cd = Number(ch?.save.flags['world.bio.cd'] ?? 0);
    const cooldownSec = Math.max(0, Math.ceil((cd - Date.now()) / 1000));
    const have = ch && active ? ch.material(active.item) : 0;
    return {
      completed,
      total: AV_DEFTERI.length,
      active,
      next,
      have,
      cooldownSec,
      canAccept: !!ch && !!next && !active && ch.level >= next.minLevel,
      canDeliver: !!active && have >= active.count && cooldownSec === 0,
    };
  }

  /** Start collecting the next step (level permitting). */
  bioAccept(): boolean {
    const ch = G.character;
    const st = this.bioStatus();
    if (!ch || !st.canAccept || !st.next) return false;
    ch.save.flags['world.bio.active'] = st.next.step;
    ch.persist();
    toast(`Av Defteri adım ${st.next.step}: ${st.next.count} ${MATERIALS[st.next.item]?.name ?? st.next.item} topla`, 'info');
    return true;
  }

  /** Deliver the active step: consumes the trophies, grants the permanent bonus and starts the cooldown. */
  bioDeliver(): boolean {
    const ch = G.character;
    const st = this.bioStatus();
    if (!ch || !st.active || !st.canDeliver) return false;
    const step = st.active;
    ch.useMaterial(step.item, step.count);
    ch.save.flags['world.bio'] = step.step;
    ch.save.flags['world.bio.active'] = 0;
    ch.save.flags['world.bio.cd'] = Date.now() + AV_DELIVERY_COOLDOWN_MS;
    ch.recomputeStats();
    ch.persist(true);
    toast(`Av Defteri adım ${step.step} tamamlandı: kalıcı ${step.rewardText}`, 'success');
    return true;
  }

  // ======================================================================== misc
  private warnOnce(key: string, msg: string): void {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    console.warn(msg);
  }
}
