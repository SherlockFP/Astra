import { RNG } from '../core/utils';
import { LEVEL_CAP, type CharacterSave } from '../types/character';
import type { ClassId } from '../types/common';
import type { EquipSlot, ItemBaseDef, ItemInstance } from '../types/items';
import { EQUIP_SLOTS } from '../types/items';
import { ITEM_BASES, TIER_MIN_ILVL } from '../data/itemBases';
import { getSpec, specsForClass } from '../data/specs';
import { specHasTree } from '../data/talentTrees/index';
import type { SkillSlotKey } from '../types/skills';
import { TALENT_NODES, TALENT_LIST } from '../data/talents';
import { DUNGEON_IDS, OPEN_ZONES } from '../data/dungeons';
import { PETS } from '../data/pets';
import { PROF_IDS } from '../data/professions';
import { buildFromBase, slotsForCategory } from './ItemGen';
import { autoBuildTree, classPoints, grantedSkillsOf, specPoints } from './Talents';
import type { CharacterState } from './CharacterState';

/**
 * BETA TEST karakteri (owner request): a character created at the level cap with everything a tester needs to try the
 * late game at once: top-track epic gear on every slot, all talent points spent on the spec's default build, every skill on
 * the bar, 100k gold, pets, all waypoints, all open-world zones (their level gates are met at the cap), PvP currencies,
 * an M+ keystone and max professions. The save is marked `beta: true` (append-only). Pure data work: no scene, no network.
 * OWNER: systems (character creation). Used by CharacterState.create(…, { beta: true }).
 */

/** Level the beta character starts at (the level cap). */
export const BETA_LEVEL = LEVEL_CAP;
/** Gold of a beta character. */
export const BETA_GOLD = 100_000;
/** Item level of the beta gear: the first ilvl of the top tier (data/itemBases TIER_MIN_ILVL). Its required level is capped at 60. */
export const BETA_ILVL = TIER_MIN_ILVL[TIER_MIN_ILVL.length - 1];
/** Passive (legacy web) points at the cap: talentPointsAt(60, 0) = 59 level points + the 6 Kadim Bilgelik bonus levels. */
export const BETA_PASSIVE_POINTS = (BETA_LEVEL - 1) + 6;
/** Skill specialisation picks per loadout (CharacterState / Talents SKILL_LEN). */
const SKILL_LEN = 9;
/** Pets handed out (the first one is summoned). */
export const BETA_PETS = ['ejder_yavrusu', 'kurt_yavrusu', 'kizil_tilki', 'buz_tilkisi'] as const;
/** PvP currency stock (materials ids of systems/PvpGear.ts): Onur, Fetih, Fetih mührü. */
export const BETA_PVP_CURRENCY: Record<string, number> = { onur_puani: 5000, fetih_puani: 2000, fetih_muhru: 40 };
/** One M+ keystone (the save holds a single key slot): dungeon and level. */
export const BETA_KEYSTONE = { dungeonId: DUNGEON_IDS[0] ?? 'kemik_mahzeni', level: 15 } as const;

/** What the preset needs from a character: its save and the equip rule of CharacterState. */
export type BetaHost = Pick<CharacterState, 'save' | 'classId' | 'canEquip'>;

/** Every waypoint stone of the open-world maps (ids the stones read as `world.wp.<id>`). */
export function betaWaypointIds(): string[] {
  const ids: string[] = [];
  for (const def of Object.values(OPEN_ZONES)) for (const w of def.world?.waypoints ?? []) ids.push(w.id);
  return [...new Set(ids)];
}

/** Gear: one epic piece per equipment slot at BETA_ILVL, the best base first. A slot the class cannot fill stays empty. */
export function betaGear(host: BetaHost, rng: RNG): EquipSlot[] {
  const { save, classId } = host;
  const filled: EquipSlot[] = [];
  // weapon first, so a one-handed weapon leaves room for the off-hand
  const order: EquipSlot[] = ['weapon', 'offhand', ...EQUIP_SLOTS.filter((s) => s !== 'weapon' && s !== 'offhand')];
  for (const slot of order) {
    if (save.equipment[slot]) continue;
    const cands = Object.values(ITEM_BASES)
      .filter((b: ItemBaseDef) => b.itemLevelRange[0] <= BETA_ILVL && slotsForCategory(b.category).includes(slot) && (!b.classes || b.classes.includes(classId)))
      .sort((a, b) => (b.itemLevelRange[0] - a.itemLevelRange[0]) || (Number(!!a.twoHanded) - Number(!!b.twoHanded)) || a.id.localeCompare(b.id));
    for (const base of cands.slice(0, 16)) {
      const item: ItemInstance = buildFromBase(base, BETA_ILVL, 'epic', rng, classId);
      if (host.canEquip(item, slot).ok) {
        save.equipment[slot] = item;
        filled.push(slot);
        break;
      }
    }
  }
  return filled;
}

/** Talents: the class tree and the spec tree spent with the spec's default (Önerilen) build; the spec is chosen when it has a tree. */
export function betaTalents(save: CharacterSave, classId: ClassId, now: number): void {
  save.tb ??= { v: 1, active: {}, saved: {}, removals: 0 };
  const spec = specsForClass(classId).find((s) => specHasTree(s));
  if (spec) {
    save.spec = spec;
    const cls = autoBuildTree('class', classPoints(BETA_LEVEL));
    const spc = autoBuildTree('spec', specPoints(BETA_LEVEL));
    save.tb.active[spec] = { id: 'active', name: 'Aktif', cls, spc, skl: new Array(SKILL_LEN).fill(0), at: now };
    // skills the build grants (G nodes) go to the spec's default bar slot when it is empty (the rule of TalentSystem.syncGrantedBar)
    const def = getSpec(spec)?.defaultBar;
    if (def) {
      for (const sk of grantedSkillsOf(classId, spec, cls, spc)) {
        if (Object.values(save.skillBar).includes(sk)) continue;
        const slot = (Object.keys(def) as SkillSlotKey[]).find((k) => def[k] === sk);
        if (slot && !save.skillBar[slot]) save.skillBar[slot] = sk;
      }
    }
  }
  // legacy passive web: grow from the class start along the links, never a socket (jewels need an item), never another class's start
  const have = new Set(save.talents);
  let spent = save.talents.filter((id) => TALENT_NODES[id] && TALENT_NODES[id].classStart !== classId).length;
  while (spent < BETA_PASSIVE_POINTS) {
    const next = TALENT_LIST.find((n) => !have.has(n.id) && n.kind !== 'socket' && n.kind !== 'start' && n.links.some((l) => have.has(l)));
    if (!next) break;
    have.add(next.id);
    save.talents.push(next.id);
    spent++;
  }
}

/** Professions (systems/Professions.ts) at the skill cap, tier 6. */
export function betaProfessions(save: CharacterSave, skillMax: number): void {
  save.professions ??= {};
  for (const id of PROF_IDS) save.professions[id] = { skill: skillMax, tier: 6 };
}

/**
 * Applies the whole beta kit to a fresh character (see the header). `host.save.level` must already be BETA_LEVEL and the
 * skill bar set by the caller (CharacterState.defaultBar). Returns a short report for the sim and the creation toast.
 */
export function applyBetaPreset(host: BetaHost, opts: { skillMax: number; rng?: RNG; now?: number }): { gear: EquipSlot[]; talentPoints: number; passive: number; waypoints: number } {
  const save = host.save;
  const rng = opts.rng ?? new RNG(save.id);
  save.beta = true;
  save.level = BETA_LEVEL;
  save.xp = 0;
  save.gold = BETA_GOLD;
  const gear = betaGear(host, rng);
  betaTalents(save, host.classId, opts.now ?? Date.now());
  // pets: all four known, the first summoned (ids of data/pets.ts)
  const known = BETA_PETS.filter((id) => PETS.some((p) => p.id === id));
  save.pets = { known: [...known], active: known[0] };
  // mount: unlocked by level (game/Mount.ts MOUNT_LEVEL), nothing to store
  for (const id of betaWaypointIds()) save.flags[`world.wp.${id}`] = true;
  save.flags['world.respawn'] = betaWaypointIds()[0] ?? '';
  for (const [id, n] of Object.entries(BETA_PVP_CURRENCY)) save.materials[id] = (save.materials[id] ?? 0) + n;
  save.mythic.keystone = { dungeonId: BETA_KEYSTONE.dungeonId, level: BETA_KEYSTONE.level };
  betaProfessions(save, opts.skillMax);
  return {
    gear,
    talentPoints: classPoints(BETA_LEVEL) + specPoints(BETA_LEVEL),
    passive: save.talents.length,
    waypoints: betaWaypointIds().length,
  };
}

/**
 * Dev tester switch (keystone.ts / finder.ts / finderFissure.ts): `?unlock` in the URL or localStorage `efsun.unlock` = '1'.
 * Hides the Kadim Yarıklar (procedural rift) finder tab and its town stone for everyone else.
 */
export function devUnlockOn(): boolean {
  try {
    return new URLSearchParams(window.location.search).has('unlock') || window.localStorage.getItem('efsun.unlock') === '1';
  } catch {
    return false;
  }
}
