import { G } from '../game/G';
import { RNG } from '../core/utils';
import type { ClassId } from '../types/common';
import { BAG_SIZE, STASH_SIZE, type CharacterSave, type CharacterSummary } from '../types/character';
import type { EquipSlot, ItemBaseDef, ItemCategory, ItemInstance } from '../types/items';
import type { SkillSlotKey } from '../types/skills';
import type { StatBlock } from '../types/stats';
import type { ActiveFx, TalentLoadout } from '../types/talents';
import type { SpecId } from '../types/v2';
import { CLASSES } from '../data/classes';
import { SKILLS } from '../data/skills';
import { CLASS_START_NODE, TALENT_NODES } from '../data/talents';
import { getMaterial, MATERIALS } from '../data/materials';
import { ITEM_BASES } from '../data/itemBases';
import { CLASS_WEAPONS, CLASS_OFFHANDS, CLASS_NAMES_TR } from '../data/itemBases';
import { SAVE_VERSION, migrateTalents } from '../core/Save';
import { migrationToast } from '../dev/migrate';
import { emit, toast } from './notify';
import { activeElixirs, computeStats, emptyFx, type SpecialEntry } from './StatCalc';
import { baseOf, buildFromBase, defaultRng, isEquipmentItem, itemDisplayName, rarityIndex, requiredLevelOf, sellValue, slotsForCategory } from './ItemGen';

export type ItemLocation =
  | { where: 'bag'; index: number }
  | { where: 'stash'; index: number }
  | { where: 'equipment'; slot: EquipSlot };

const err = (text: string) => toast(text, 'error');

/** Fallback starting gear when ClassDef.startingItems is missing. */
// The new classes' rows are GDD_CLASSES_V2 §8 verbatim (NC04); NC09 owns the item bases behind them.
const START_GEAR: Record<ClassId, string[]> = {
  knight: ['sword1h_t1', 'shield_t1', 'chest_heavy_t1', 'boots_heavy_t1'],
  barbarian: ['axe2h_t1', 'chest_heavy_t1', 'boots_heavy_t1'],
  mage: ['staff_t1', 'chest_light_t1', 'boots_light_t1'],
  rogue: ['dagger_t1', 'dagger_t1', 'chest_medium_t1', 'boots_medium_t1'],
  monk: ['fist_t1', 'chest_medium_t1', 'boots_medium_t1'],
  archer: ['bow_t1', 'quiver_t1', 'chest_medium_t1', 'boots_medium_t1'],
  paladin: ['mace_t1', 'shield_t1', 'chest_heavy_t1', 'boots_heavy_t1'],
  necromancer: ['staff_t1', 'chest_light_t1', 'boots_light_t1'],
  warlock: ['staff_t1', 'chest_light_t1', 'boots_light_t1'],
  demonhunter: ['dagger_t1', 'dagger_t1', 'chest_medium_t1', 'boots_medium_t1'], // CM1 stub (not playable yet)
  evoker: ['staff_t1', 'chest_light_t1', 'boots_light_t1'],                     // CM1 stub
};
/** Extra pieces every class gets so the first minutes already feel like dressing up a hero. */
const START_EXTRA_GEAR: Record<ClassId, string[]> = {
  knight: ['helm_heavy_t1', 'gloves_heavy_t1'],
  barbarian: ['helm_heavy_t1', 'legs_heavy_t1'],
  mage: ['helm_light_t1', 'gloves_light_t1'],
  rogue: ['helm_medium_t1', 'gloves_medium_t1'],
  monk: ['helm_medium_t1', 'gloves_medium_t1'],
  archer: ['helm_medium_t1', 'gloves_medium_t1'],
  paladin: ['helm_heavy_t1', 'gloves_heavy_t1'],
  necromancer: ['helm_light_t1', 'gloves_light_t1'],
  warlock: ['helm_light_t1', 'gloves_light_t1'],
  demonhunter: ['helm_medium_t1', 'gloves_medium_t1'], // CM1 stub
  evoker: ['helm_light_t1', 'gloves_light_t1'],         // CM1 stub
};
/** Spare gear in the bag (Mage can switch to wand + tome). */
const START_BAG: Record<ClassId, string[]> = {
  knight: [], barbarian: [], mage: ['wand_t1', 'tome_t1'], rogue: [],
  monk: [], archer: [], paladin: ['sword1h_t1'], necromancer: ['wand_t1', 'tome_t1'], warlock: ['wand_t1', 'tome_t1'],
  demonhunter: [], evoker: ['wand_t1', 'tome_t1'], // CM1 stubs
};

/** Bag sort order: weapons, off-hands, armour, belt, jewelry; then rarity, item level, upgrade, name. */
const SORT_ORDER: ItemCategory[] = [
  'sword1h', 'sword2h', 'axe1h', 'axe2h', 'mace', 'staff', 'wand', 'dagger', 'crossbow', 'bow', 'shield', 'tome', 'quiver',
  'helm', 'shoulders', 'chest', 'gloves', 'legs', 'boots', 'belt', 'amulet', 'ring',
];
function sortCompare(a: ItemInstance, b: ItemInstance): number {
  const ia = SORT_ORDER.indexOf(baseOf(a)?.category ?? 'junk'), ib = SORT_ORDER.indexOf(baseOf(b)?.category ?? 'junk');
  const oa = ia < 0 ? 99 : ia, ob = ib < 0 ? 99 : ib;
  if (oa !== ob) return oa - ob;
  const ra = rarityIndex(a.rarity), rb = rarityIndex(b.rarity);
  if (ra !== rb) return rb - ra;
  if (a.itemLevel !== b.itemLevel) return b.itemLevel - a.itemLevel;
  if ((a.upgrade ?? 0) !== (b.upgrade ?? 0)) return (b.upgrade ?? 0) - (a.upgrade ?? 0);
  return itemDisplayName(a).localeCompare(itemDisplayName(b), 'tr');
}

let unloadHooked = false;

/**
 * The selected character. ALL mutations of CharacterSave go through here so events fire
 * ('inventory:changed', 'equipment:changed', 'player:gold', 'materials:changed', 'player:stats', ...)
 * and the save is persisted (debounced).
 * OWNER: items/progression module.
 */
export class CharacterState {
  save: CharacterSave;
  /** Final stats (class + level + gear + upgrades + gems + talents + set bonuses), excluding temporary buffs. See StatCalc header. */
  stats: StatBlock = {};
  /** Special effects active on this character (legendary effects, set bonuses, talent notables/keystones) by special id. */
  specials: Record<string, SpecialEntry> = {};
  /** Product of all "DAHA FAZLA hasar" multipliers (keystones). */
  moreDamage = 1;
  /** Equipped piece count per set id. */
  setCounts: Record<string, number> = {};
  hasShield = false;
  /** Talent layer of the active spec (GDD_TALENTS §2.5): mods, procs and grants; stats are already in `stats`. */
  fx: ActiveFx = emptyFx();

  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private elixirSave = 0;

  constructor(save: CharacterSave) {
    this.save = CharacterState.normalize(save);
    this.recomputeStats(false);
    this.announceMigration();
    if (typeof window !== 'undefined' && !unloadHooked) {
      unloadHooked = true;
      const flush = () => G.character?.persist(true);
      window.addEventListener('pagehide', flush);
      window.addEventListener('beforeunload', flush);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') flush();
      });
    }
  }

  /** Fill every field a (possibly older) save may lack. */
  static normalize(save: CharacterSave): CharacterSave {
    save.version ??= 1;
    save.appearance ??= { variant: 0 };
    save.level = Math.max(1, Math.min(60, Math.floor(save.level || 1)));
    save.xp ??= 0;
    save.gold ??= 0;
    save.playedSec ??= 0;
    save.equipment ??= {};
    save.materials ??= {};
    save.talents ??= [];
    save.talentRefunds ??= 0;
    save.skillBar ??= {};
    save.skillRanks ??= {};
    save.flags ??= {};
    save.stats ??= { kills: 0, deaths: 0, bossKills: 0, dungeonsCompleted: 0, highestKey: 0, legendaryFound: 0 };
    save.mythic ??= { rating: 0, best: {}, weekly: { week: 0, runs: [] }, vaultClaimedWeek: -1, keystone: null };
    if (!Array.isArray(save.bag)) save.bag = [];
    if (!Array.isArray(save.stash)) save.stash = [];
    while (save.bag.length < BAG_SIZE) save.bag.push(null);
    while (save.stash.length < STASH_SIZE) save.stash.push(null);
    const start = CLASS_START_NODE[save.classId];
    if (start && !save.talents.includes(start)) save.talents.unshift(start);
    // GDD_TALENTS (T6): mastery XP and passive extras always exist; migrateTalents fills tb and runs once per save
    save.skillMastery ??= {};
    save.passiveExtra ??= { picks: {}, jewels: {} };
    migrateTalents(save);
    return save;
  }

  /** New level-1 character with starting gear, potions and default skill bar. */
  static create(name: string, classId: ClassId, variant = 0): CharacterState {
    const now = Date.now();
    const save: CharacterSave = {
      version: SAVE_VERSION, id: 'c' + now.toString(36) + Math.random().toString(36).slice(2, 5), name, classId, appearance: { variant }, level: 1, xp: 0, gold: 50,
      createdAt: now, lastPlayed: now, playedSec: 0, equipment: {}, bag: new Array(BAG_SIZE).fill(null), stash: new Array(STASH_SIZE).fill(null),
      materials: { pot_hp_1: 5, pot_res_1: 5, scroll_town: 1 }, talents: [CLASS_START_NODE[classId]], talentRefunds: 0, skillBar: {}, skillRanks: {},
      mythic: { rating: 0, best: {}, weekly: { week: 0, runs: [] }, vaultClaimedWeek: -1, keystone: null },
      flags: {}, stats: { kills: 0, deaths: 0, bossKills: 0, dungeonsCompleted: 0, highestKey: 0, legendaryFound: 0 },
      tb: { v: 1, active: {}, saved: {}, removals: 0 }, skillMastery: {}, passiveExtra: { picks: {}, jewels: {} },
    };
    const rng = new RNG((now ^ 0x9e3779b9) >>> 0);
    const ch = new CharacterState(save);
    const defIds = CLASSES[classId]?.startingItems?.filter((id) => ITEM_BASES[id]) ?? [];
    const gearIds = [...(defIds.length ? defIds : START_GEAR[classId]), ...START_EXTRA_GEAR[classId]];
    // armour pieces from the fallback list that the class def did not include
    for (const id of START_GEAR[classId]) if (!gearIds.includes(id) && !ITEM_BASES[id]?.weaponDamage && ITEM_BASES[id]?.category !== 'shield' && gearIds.filter((g) => ITEM_BASES[g]?.category === ITEM_BASES[id]?.category).length === 0) gearIds.push(id);
    for (const id of gearIds) {
      const base = ITEM_BASES[id];
      if (!base) continue;
      const it = buildFromBase(base, 1, 'common', rng, classId);
      it.affixes = [];
      delete it.sockets;
      const slot = ch.pickSlot(it);
      if (slot && !save.equipment[slot] && ch.canEquip(it, slot).ok) save.equipment[slot] = it;
      else ch.addItem(it);
    }
    for (const id of START_BAG[classId]) {
      const base = ITEM_BASES[id];
      if (base) ch.addItem(buildFromBase(base, 1, 'common', rng, classId));
    }
    save.skillBar = CharacterState.defaultBar(classId, 1);
    ch.recomputeStats(false);
    return ch;
  }

  /** Default skill bar of a class at a level: lmb = basic attack; unlocked skills fill rmb,q,e,s1,s2,s3 (L25 skill is benched), r = ultimate. */
  static defaultBar(classId: ClassId, level: number): Partial<Record<SkillSlotKey, string>> {
    const bar: Partial<Record<SkillSlotKey, string>> = {};
    const def = CLASSES[classId];
    bar.lmb = def?.basicAttack ?? `${classId}_basic`;
    const order: (SkillSlotKey | null)[] = ['rmb', 'q', 'e', 's1', 's2', 's3', null, 'r'];
    const levels = [1, 3, 6, 10, 15, 20, 25, 30];
    (def?.skills ?? []).forEach((id, i) => {
      const slot = SKILLS[id]?.defaultSlot ?? order[i];
      const unlock = SKILLS[id]?.unlockLevel ?? levels[i];
      if (slot && level >= unlock && (i !== 6 || SKILLS[id]?.defaultSlot)) bar[slot] = id;
    });
    return bar;
  }

  get classId(): ClassId {
    return this.save.classId;
  }
  get level(): number {
    return this.save.level;
  }
  get name(): string {
    return this.save.name;
  }
  /** Active spec (GDD_TALENTS §2.4); null before the level-10 choice. */
  get spec(): SpecId | null {
    return this.save.spec ?? null;
  }
  /** Committed loadout of the active spec (`tb.active[spec]`); null without a spec or before its first commit. */
  get activeLoadout(): TalentLoadout | null {
    const spec = this.save.spec;
    return (spec && this.save.tb?.active[spec]) || null;
  }

  // ======================================================================== stats
  /**
   * Recompute final stats (call after gear/talent/level changes). Emits 'player:stats'. Also stores the talent layer
   * (`fx`), hands the proc entries to the proc engine and drops the resolved skills (their cache follows the stats).
   */
  recomputeStats(notify = true): StatBlock {
    try {
      const r = computeStats(this.save);
      this.stats = r.stats;
      this.specials = r.specials;
      this.moreDamage = r.moreDamage;
      this.setCounts = r.setCounts;
      this.hasShield = r.hasShield;
      this.fx = r.fx;
    } catch (e) {
      console.error('[character] stat computation failed', e);
    }
    // both services are optional until Game.ts wires them; SkillSystem's resolved-skill cache is cleared when it has one
    G.procs?.setEntries(this.fx.procs);
    (G.skills as unknown as { invalidateResolved?: () => void } | undefined)?.invalidateResolved?.();
    if (notify) emit('player:stats', {});
    return this.stats;
  }

  hasSpecial(id: string): boolean {
    return !!this.specials[id];
  }
  specialParams(id: string): Record<string, number> {
    return this.specials[id]?.params ?? {};
  }

  // ======================================================================== talent layer (GDD_TALENTS T6)
  /** Stores the active spec and refolds the stats. Bars, rules and `spec:changed` belong to TalentSystem.setSpec. */
  setSpec(id: SpecId): void {
    this.save.spec = id;
    this.recomputeStats();
    this.persist();
  }

  /** Why a passive-web edit (mastery pick, jewel) is refused right now: combat or a dungeon run. Null when allowed. */
  webEditReason(): string | null {
    if (G.player?.inCombat) return 'Savaşta değiştirilemez.';
    const edit = G.talents?.canEditHere();
    return edit && !edit.add ? edit.reason ?? 'Şu an değiştirilemez.' : null;
  }

  /** Picks option `idx` (0–2) of an allocated mastery node (GDD_TALENTS §3.6). Free; refused in combat or a dungeon run. */
  pickMastery(nodeId: string, idx: number): boolean {
    const node = TALENT_NODES[nodeId];
    if (!node || node.kind !== 'mastery' || !node.choices?.length) return false;
    if (!this.save.talents.includes(nodeId)) return false;
    if (!Number.isInteger(idx) || idx < 0 || idx >= node.choices.length) return false;
    const reason = this.webEditReason();
    if (reason) {
      err(reason);
      return false;
    }
    const pe = (this.save.passiveExtra ??= { picks: {}, jewels: {} });
    pe.picks[nodeId] = idx;
    this.recomputeStats();
    emit('passives:changed', {});
    this.persist();
    return true;
  }

  /**
   * Sockets a jewel (`item`, owned, id `jewel_*`) into an allocated socket node, or empties it (`null`). The jewel leaves
   * the bag; a jewel it replaces returns to the bag. Refused when the item is not owned or not a jewel, or the bag is full.
   */
  socketJewel(nodeId: string, item: ItemInstance | null): boolean {
    const node = TALENT_NODES[nodeId];
    if (!node || node.kind !== 'socket' || !this.save.talents.includes(nodeId)) return false;
    const reason = this.webEditReason();
    if (reason) {
      err(reason);
      return false;
    }
    const pe = (this.save.passiveExtra ??= { picks: {}, jewels: {} });
    const old = pe.jewels[nodeId] ?? null;
    if (item) {
      const found = this.findItem(item.uid);
      if (!found || found.loc.where === 'equipment' || !found.item.baseId.startsWith('jewel_')) return false;
      const bagFree = this.save.bag.filter((x) => !x).length + (found.loc.where === 'bag' ? 1 : 0);
      if (old && bagFree < 1) {
        err('Çantan dolu!');
        return false;
      }
      this.removeItem(found.item.uid);
      pe.jewels[nodeId] = found.item;
      if (old) this.addItem(old);
    } else {
      if (!old) return false;
      if (this.save.bag.every((x) => x)) {
        err('Çantan dolu!');
        return false;
      }
      pe.jewels[nodeId] = null;
      this.addItem(old);
    }
    this.recomputeStats();
    emit('passives:changed', {});
    this.persist();
    return true;
  }

  /** Average equipped item level (WoW style, over filled slots). */
  itemLevel(): number {
    let sum = 0, n = 0;
    for (const it of Object.values(this.save.equipment)) {
      if (!it) continue;
      sum += it.itemLevel;
      n++;
    }
    return n ? Math.round(sum / n) : 0;
  }

  summary(): CharacterSummary {
    return { id: this.save.id, name: this.save.name, classId: this.save.classId, level: this.save.level, itemLevel: this.itemLevel(), rating: this.save.mythic.rating, variant: this.save.appearance.variant };
  }

  // ======================================================================== inventory
  private getAt(loc: ItemLocation): ItemInstance | null {
    if (loc.where === 'equipment') return this.save.equipment[loc.slot] ?? null;
    const arr = loc.where === 'bag' ? this.save.bag : this.save.stash;
    return arr[loc.index] ?? null;
  }
  private validLoc(loc: ItemLocation): boolean {
    if (loc.where === 'equipment') return !!loc.slot;
    const arr = loc.where === 'bag' ? this.save.bag : this.save.stash;
    return Number.isInteger(loc.index) && loc.index >= 0 && loc.index < arr.length;
  }
  private putAt(loc: ItemLocation, item: ItemInstance | null): void {
    if (loc.where === 'equipment') {
      if (item) this.save.equipment[loc.slot] = item;
      else delete this.save.equipment[loc.slot];
    } else (loc.where === 'bag' ? this.save.bag : this.save.stash)[loc.index] = item;
  }

  /** Put into the first free bag slot (stacks stackables). False if the bag is full. Idempotent by uid. */
  addItem(item: ItemInstance): boolean {
    if (this.findItem(item.uid)) return true;
    const base = baseOf(item);
    if (base?.stackable && item.quantity) {
      const max = base.maxStack ?? 99;
      for (const slot of this.save.bag) {
        if (slot && slot.baseId === item.baseId && (slot.quantity ?? 1) < max) {
          const take = Math.min(max - (slot.quantity ?? 1), item.quantity);
          slot.quantity = (slot.quantity ?? 1) + take;
          item.quantity -= take;
          if (item.quantity <= 0) {
            this.changedInventory();
            return true;
          }
        }
      }
    }
    const i = this.save.bag.findIndex((x) => !x);
    if (i < 0) return false;
    this.save.bag[i] = item;
    if (item.rarity === 'legendary' || item.rarity === 'set') this.save.stats.legendaryFound++;
    this.changedInventory();
    return true;
  }

  private changedInventory(): void {
    emit('inventory:changed', {});
    this.persist();
  }

  removeItem(uid: string): ItemInstance | null {
    const f = this.findItem(uid);
    if (!f) return null;
    this.putAt(f.loc, null);
    if (f.loc.where === 'equipment') {
      this.recomputeStats();
      emit('equipment:changed', { slot: f.loc.slot });
    }
    this.changedInventory();
    return f.item;
  }

  findItem(uid: string): { loc: ItemLocation; item: ItemInstance } | null {
    const bag = this.save.bag;
    for (let i = 0; i < bag.length; i++) if (bag[i]?.uid === uid) return { loc: { where: 'bag', index: i }, item: bag[i]! };
    for (const [slot, it] of Object.entries(this.save.equipment)) if (it?.uid === uid) return { loc: { where: 'equipment', slot: slot as EquipSlot }, item: it };
    const st = this.save.stash;
    for (let i = 0; i < st.length; i++) if (st[i]?.uid === uid) return { loc: { where: 'stash', index: i }, item: st[i]! };
    return null;
  }

  /** Every item the character owns (bag, stash and equipment). */
  allItems(): { loc: ItemLocation; item: ItemInstance }[] {
    const out: { loc: ItemLocation; item: ItemInstance }[] = [];
    this.save.bag.forEach((it, index) => it && out.push({ loc: { where: 'bag', index }, item: it }));
    this.save.stash.forEach((it, index) => it && out.push({ loc: { where: 'stash', index }, item: it }));
    for (const [slot, it] of Object.entries(this.save.equipment)) if (it) out.push({ loc: { where: 'equipment', slot: slot as EquipSlot }, item: it });
    return out;
  }

  getEquipped(slot: EquipSlot): ItemInstance | null {
    return this.save.equipment[slot] ?? null;
  }

  /** The slot an item would go to (rings: ring1 then ring2; daggers: weapon, then off-hand for Haydut). */
  pickSlot(item: ItemInstance): EquipSlot | null {
    const base = baseOf(item);
    if (!base) return null;
    const slots = slotsForCategory(base.category);
    if (!slots.length) return null;
    const eq = this.save.equipment;
    if (base.category === 'ring') return !eq.ring1 ? 'ring1' : !eq.ring2 ? 'ring2' : 'ring1';
    if (base.category === 'dagger') {
      if (!eq.weapon) return 'weapon';
      const main = baseOf(eq.weapon);
      if (this.classId === 'rogue' && main && !main.twoHanded && !eq.offhand) return 'offhand';
      return 'weapon';
    }
    return slots[0];
  }

  /** Validation: class, level, slot compatibility, two-handed rules. */
  canEquip(item: ItemInstance, slot?: EquipSlot): { ok: boolean; reason?: string } {
    const base = baseOf(item);
    if (!base || !isEquipmentItem(item)) return { ok: false, reason: 'Bu eşya kuşanılamaz.' };
    const target = slot ?? this.pickSlot(item);
    if (!target) return { ok: false, reason: 'Uygun yuva yok.' };
    if (!slotsForCategory(base.category).includes(target)) return { ok: false, reason: 'Bu eşya o yuvaya takılamaz.' };
    if (base.classes && !base.classes.includes(this.classId)) {
      const names = base.classes.map((c) => CLASS_NAMES_TR[c]).join(' / ');
      return { ok: false, reason: `Bu eşyayı yalnızca ${names} kullanabilir.` };
    }
    if (base.category !== 'dagger' && isWeaponLike(base) && !CLASS_WEAPONS[this.classId].includes(base.category)) return { ok: false, reason: 'Sınıfın bu silahı kullanamaz.' };
    if (target === 'offhand' && !CLASS_OFFHANDS[this.classId].includes(base.category)) return { ok: false, reason: 'Sınıfın bu yan el eşyasını kullanamaz.' };
    const req = requiredLevelOf(item);
    if (req > this.level) return { ok: false, reason: `Gerekli seviye: ${req}` };
    const eq = this.save.equipment;
    if (target === 'offhand' && eq.weapon) {
      const mb = baseOf(eq.weapon);
      if (mb?.twoHanded) return { ok: false, reason: 'Çift el silah kuşanıyken yan el kullanılamaz.' };
      if (base.category === 'tome' && this.classId === 'mage' && mb?.category === 'staff') return { ok: false, reason: 'Büyü kitabı için değnek gerekir.' };
      if (base.category === 'dagger' && mb?.category !== 'dagger') return { ok: false, reason: 'Yan el hançeri için ana elde hançer gerekir.' };
    }
    return { ok: true };
  }

  /** Move/swap between bag/stash/equipment locations with validation. */
  moveItem(from: ItemLocation, to: ItemLocation): boolean {
    if (!this.validLoc(from) || !this.validLoc(to)) return false;
    if (from.where === to.where && ((from.where === 'equipment' && to.where === 'equipment' && from.slot === to.slot) || (from.where !== 'equipment' && to.where !== 'equipment' && from.index === to.index))) return false;
    const a = this.getAt(from);
    if (!a) return false;
    const b = this.getAt(to);
    // equipment destinations: validate
    if (to.where === 'equipment') {
      const chk = this.canEquip(a, to.slot);
      if (!chk.ok) {
        err(chk.reason ?? 'Kuşanılamaz.');
        return false;
      }
      if (to.slot === 'weapon' && baseOf(a)?.twoHanded && this.save.equipment.offhand && !(from.where === 'equipment' && from.slot === 'offhand')) {
        err('Önce yan eldeki eşyayı çıkar.');
        return false;
      }
    }
    // the swapped item must also fit where `a` came from
    if (b && from.where === 'equipment') {
      const chk = this.canEquip(b, from.slot);
      if (!chk.ok) {
        err(chk.reason ?? 'Yer değiştirilemez.');
        return false;
      }
    }
    // stacking within the bag
    const baseA = baseOf(a);
    if (b && baseA?.stackable && a.baseId === b.baseId && to.where !== 'equipment' && from.where !== 'equipment') {
      const max = baseA.maxStack ?? 99;
      const room = max - (b.quantity ?? 1);
      if (room > 0) {
        const take = Math.min(room, a.quantity ?? 1);
        b.quantity = (b.quantity ?? 1) + take;
        a.quantity = (a.quantity ?? 1) - take;
        if (a.quantity <= 0) this.putAt(from, null);
        this.changedInventory();
        return true;
      }
    }
    this.putAt(to, a);
    this.putAt(from, b);
    if (from.where === 'equipment') emit('equipment:changed', { slot: from.slot });
    if (to.where === 'equipment') emit('equipment:changed', { slot: to.slot });
    if (from.where === 'equipment' || to.where === 'equipment') this.recomputeStats();
    this.changedInventory();
    return true;
  }

  /** Equip from bag (auto-picks slot; rings fill ring1 then ring2). Returns false if not allowed. */
  equip(uid: string): boolean {
    const f = this.findItem(uid);
    if (!f || f.loc.where === 'equipment') return false;
    const item = f.item;
    const slot = this.pickSlot(item);
    if (!slot) return false;
    const chk = this.canEquip(item, slot);
    if (!chk.ok) {
      err(chk.reason ?? 'Kuşanılamaz.');
      return false;
    }
    const base = baseOf(item);
    const eq = this.save.equipment;
    // two-handed weapon pushes the off-hand into the bag
    let pushed: ItemInstance | null = null;
    if (slot === 'weapon' && base?.twoHanded && eq.offhand) {
      const freeNeeded = f.loc.where === 'bag' ? 1 : 2;
      if (this.freeBagSlots() < freeNeeded) {
        err('Çantan dolu!');
        return false;
      }
      pushed = eq.offhand;
      delete eq.offhand;
      emit('equipment:changed', { slot: 'offhand' });
    }
    const prev = eq[slot] ?? null;
    eq[slot] = item;
    this.putAt(f.loc, prev);
    if (pushed) {
      const i = this.save.bag.findIndex((x) => !x);
      if (i >= 0) this.save.bag[i] = pushed;
    }
    this.recomputeStats();
    emit('equipment:changed', { slot });
    this.changedInventory();
    return true;
  }

  unequip(slot: EquipSlot): boolean {
    const it = this.save.equipment[slot];
    if (!it) return false;
    const i = this.save.bag.findIndex((x) => !x);
    if (i < 0) {
      err('Çantan dolu!');
      return false;
    }
    this.save.bag[i] = it;
    delete this.save.equipment[slot];
    this.recomputeStats();
    emit('equipment:changed', { slot });
    this.changedInventory();
    return true;
  }

  /** Sell value in gold; removes the item and pays the gold. 0 = not sold (locked / not owned). */
  sellItem(uid: string): number {
    const f = this.findItem(uid);
    if (!f || f.loc.where === 'equipment' || f.item.locked) return 0;
    const gold = sellValue(f.item);
    this.putAt(f.loc, null);
    this.addGold(gold);
    this.changedInventory();
    return gold;
  }

  /** Sort the bag: by slot, rarity (best first), item level, upgrade level, name. One event, one save. */
  sortBag(): void {
    this.sortInto(this.save.bag);
  }
  sortStash(): void {
    this.sortInto(this.save.stash);
  }
  private sortInto(arr: (ItemInstance | null)[]): void {
    const items = arr.filter((x): x is ItemInstance => !!x).sort(sortCompare);
    arr.fill(null);
    items.forEach((it, i) => {
      arr[i] = it;
    });
    this.changedInventory();
  }

  freeBagSlots(): number {
    let n = 0;
    for (const s of this.save.bag) if (!s) n++;
    return n;
  }

  // ======================================================================== currencies
  addGold(amount: number): void {
    const delta = Math.round(amount);
    if (!delta) return;
    this.save.gold = Math.max(0, this.save.gold + delta);
    emit('player:gold', { gold: this.save.gold, delta });
    this.persist();
  }
  spendGold(amount: number): boolean {
    const a = Math.ceil(amount);
    if (a < 0 || this.save.gold < a) return false;
    if (a === 0) return true;
    this.save.gold -= a;
    emit('player:gold', { gold: this.save.gold, delta: -a });
    this.persist();
    return true;
  }
  material(id: string): number {
    return this.save.materials[id] ?? 0;
  }
  addMaterial(id: string, n: number): void {
    const count = Math.floor(n);
    if (count <= 0) return;
    const max = getMaterial(id)?.maxStack ?? 9999;
    this.save.materials[id] = Math.min(max, (this.save.materials[id] ?? 0) + count);
    emit('materials:changed', {});
    this.persist();
  }
  useMaterial(id: string, n: number): boolean {
    const count = Math.floor(n);
    if (count <= 0) return true;
    if ((this.save.materials[id] ?? 0) < count) return false;
    this.save.materials[id] -= count;
    if (this.save.materials[id] <= 0) delete this.save.materials[id];
    emit('materials:changed', {});
    this.persist();
    return true;
  }
  /** True if every material of the list is available. */
  hasMaterials(list: { id: string; count: number }[]): boolean {
    return list.every((m) => this.material(m.id) >= m.count);
  }
  /** Consume a list of materials atomically. */
  spendMaterials(list: { id: string; count: number }[]): boolean {
    if (!this.hasMaterials(list)) return false;
    for (const m of list) {
      if (m.count <= 0) continue;
      this.save.materials[m.id] -= m.count;
      if (this.save.materials[m.id] <= 0) delete this.save.materials[m.id];
    }
    emit('materials:changed', {});
    this.persist();
    return true;
  }

  // ======================================================================== skills
  /**
   * Read a skill book (GDD_OPENWORLD 4.6): raises the rank of one unlocked skill by 1 and consumes the book.
   * Book I caps at rank 3, II at 5, III at 6; a rank never exceeds ceil(level / 6) + 1.
   * Combat reads `save.skillRanks` (+5% damage, -2% cooldown per rank above 1) once it is wired.
   */
  readSkillBook(bookId: string, skillId: string): { ok: boolean; reason?: string; rank?: number } {
    const bookCap: Record<string, number> = { beceri_kitabi_1: 3, beceri_kitabi_2: 5, beceri_kitabi_3: 6 };
    const cap = bookCap[bookId];
    if (!cap) return { ok: false, reason: 'Bu bir beceri kitabı değil.' };
    if (this.material(bookId) <= 0) return { ok: false, reason: 'Kitap envanterde yok.' };
    const unlocked = G.progression?.unlockedSkills(this.classId, this.level) ?? [];
    if (!unlocked.includes(skillId)) return { ok: false, reason: 'Bu beceri henüz açık değil.' };
    const current = this.save.skillRanks[skillId] ?? 1;
    const max = Math.min(cap, Math.ceil(this.level / 6) + 1, 6);
    if (current >= max) return { ok: false, reason: `Bu beceri en fazla ${max}. kademeye kadar yükseltilebilir.` };
    this.useMaterial(bookId, 1);
    this.save.skillRanks[skillId] = current + 1;
    this.persist();
    return { ok: true, rank: current + 1 };
  }

  setSkillSlot(slot: SkillSlotKey, skillId: string | null): void {
    if (skillId) {
      const def = SKILLS[skillId];
      if (def) {
        if (def.classId !== 'common' && def.classId !== this.classId) return;
        if (def.unlockLevel > this.level) {
          err('Bu beceri henüz açılmadı.');
          return;
        }
        const ultimate = def.tags.includes('ultimate');
        if (slot === 'r' && !ultimate) {
          err('R yuvası yalnızca büyük beceri içindir.');
          return;
        }
        if (ultimate && slot !== 'r') {
          err('Büyük beceri yalnızca R yuvasına konabilir.');
          return;
        }
      }
      // a skill lives in one slot only
      for (const [k, v] of Object.entries(this.save.skillBar)) if (v === skillId && k !== slot) delete this.save.skillBar[k as SkillSlotKey];
      this.save.skillBar[slot] = skillId;
    } else delete this.save.skillBar[slot];
    emit('skillbar:changed', {});
    this.persist();
  }

  // ======================================================================== elixirs / consumables
  /** Advance elixir timers (only while in game). Called by LootSystem.update. */
  tickBuffs(dt: number): void {
    const flags = this.save.flags;
    let changed = false;
    for (const cat of ['war', 'guard', 'help']) {
      const key = `elixir.${cat}.left`;
      const left = Number(flags[key] ?? 0);
      if (left <= 0) continue;
      const next = left - dt;
      if (next <= 0) {
        const id = String(flags['elixir.' + cat] ?? '');
        delete flags[key];
        delete flags['elixir.' + cat];
        changed = true;
        const name = getMaterial(id)?.name ?? 'İksir';
        emit('ui:toast', { text: `${name} etkisi sona erdi.`, kind: 'info' });
      } else flags[key] = next;
    }
    this.elixirSave += dt;
    if (changed) {
      this.recomputeStats();
      emit('elixir:changed', {});
      this.persist();
    } else if (this.elixirSave > 15 && activeElixirs(this.save).length) {
      this.elixirSave = 0;
      this.persist();
    }
  }

  /** Drink an elixir (one per category; replaces the active one). */
  useElixir(id: string): { ok: boolean; reason?: string } {
    const def = MATERIALS[id];
    if (!def?.elixir) return { ok: false, reason: 'Bu bir iksir değil.' };
    if ((def.requiredLevel ?? 1) > this.level) return { ok: false, reason: `Gerekli seviye: ${def.requiredLevel}` };
    if (!this.useMaterial(id, 1)) return { ok: false, reason: 'İksirin yok.' };
    this.save.flags['elixir.' + def.elixir.category] = id;
    this.save.flags[`elixir.${def.elixir.category}.left`] = def.elixir.durationSec;
    this.recomputeStats();
    emit('elixir:changed', {});
    emit('ui:toast', { text: `${def.name} içildi (${Math.round(def.elixir.durationSec / 60)} dk).`, kind: 'success' });
    this.persist();
    return { ok: true };
  }

  /** Use a stackable consumable from the pouch (potions go through Combat.usePotion). */
  useConsumable(id: string): { ok: boolean; reason?: string } {
    const def = MATERIALS[id];
    if (!def || def.kind !== 'consumable') return { ok: false, reason: 'Kullanılamaz.' };
    if (def.elixir) return this.useElixir(id);
    if (def.potion) {
      const ok = G.combat?.usePotion(def.potion.kind) ?? false;
      return ok ? { ok: true } : { ok: false, reason: 'İksir şu anda kullanılamaz.' };
    }
    if (def.scroll) return G.loot?.useTownScroll() ?? { ok: false, reason: 'Şu anda kullanılamaz.' };
    return { ok: false, reason: 'Kullanılamaz.' };
  }

  // ======================================================================== persistence
  /** Debounced write to localStorage via G.save. */
  persist(immediate = false): void {
    if (immediate) {
      if (this.persistTimer) clearTimeout(this.persistTimer);
      this.persistTimer = null;
      this.flush();
      return;
    }
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.flush();
    }, 600);
  }

  private flush(): void {
    try {
      G.save?.write(this.save);
    } catch (e) {
      console.error('[character] save failed', e);
    }
  }

  /**
   * GDD_TALENTS §1.8: a load that migrated the spec (Save.load) left the old spec id in flags['tb.migToast']. The toast goes
   * out once: the flag is cleared and the save written first, so a later load does not show it again.
   */
  private announceMigration(): void {
    const from = this.save.flags['tb.migToast'];
    if (typeof from !== 'string') return;
    delete this.save.flags['tb.migToast'];
    this.flush();
    const text = migrationToast({ spec: from }, this.save);
    if (text) toast(text, 'info');
  }
}

function isWeaponLike(base: ItemBaseDef): boolean {
  return !!base.weaponDamage && base.category !== 'tome' && base.category !== 'shield';
}

/** Dev helper: quick item for tests. */
export function makeTestItem(baseId: string, ilvl: number, rarity: ItemInstance['rarity'], classId?: ClassId): ItemInstance | null {
  const base = ITEM_BASES[baseId];
  return base ? buildFromBase(base, ilvl, rarity, defaultRng, classId) : null;
}
