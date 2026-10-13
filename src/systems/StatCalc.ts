import { clamp } from '../core/utils';
import { CLASSES } from '../data/classes';
import { TALENT_NODES } from '../data/talents';
import { SETS, UNIQUES } from '../data/uniques';
import { getMaterial } from '../data/materials';
import { AV_DEFTERI } from '../data/avDefteri';
import { getSpec } from '../data/specs';
import { SIGNATURE_SKILLS, skillSpecsOf } from '../data/skillSpecs';
import { parseFx } from '../data/talentTrees/fx';
import { getTree } from '../data/talentTrees/index';
import { PALETTE_VALUE } from '../data/talentTrees/palette';
import { collectMods } from '../combat/skillMods';
import { baseOf, itemStats } from './ItemGen';
import { masteryRankAt } from './SkillMastery';
import type { ClassId } from '../types/common';
import type { CharacterSave } from '../types/character';
import { EQUIP_SLOTS } from '../types/items';
import type { ActiveFx, FxItem, ModEntry, TreeDef } from '../types/talents';
import { addStats, type StatBlock, type StatId } from '../types/stats';
import type { SpecId } from '../types/v2';

/**
 * Folds every stat source into the FINAL StatBlock of the local character (GDD_SYSTEMS 1.2-1.3):
 *  class base + per level, gear (implicit, affixes, upgrade bonus, gems), set bonuses, passive tree, spec passive,
 *  talent layer (collectFx, GDD_TALENTS §2.5), elixirs. The talent layer's mods / procs / grants travel in `fx`.
 *
 * FINAL VALUES in `stats` (consumers must NOT re-apply these):
 *   str/dex/int/vit      class base + growth + gear + talents + allAttr   (allAttr is folded and set to 0)
 *   maxHp                full formula incl. maxHpPct and "more" keystones (maxHpPct set to 0)
 *   armor                (2*str + gear armour) * (1 + armorPct)           (armorPct set to 0)
 *   maxResource          class pool (+0.25*int for mana) + gear/talents
 *   resourceRegen        class regen (+0.015*int for mana) * (1 + resourceRegenPct)   (pct set to 0)
 *   hpRegen              flat + hpRegenPct*maxHp (hpRegenPct set to 0)
 *   critChance           0.05 + 0.0002*dex + gear, clamped 0..0.75
 *   dodgeChance          0.0001*dex + gear, clamped 0..0.40
 *   blockChance          0 without a shield; shield implicit + gear + knight guardian bonus, clamped
 *   resFire..resArcane   gear + resAll + 0.0005*int, clamped -1..0.75 (resAll set to 0)
 *   weaponMin/weaponMax  main hand after local mods + upgrade (+25% of an off-hand dagger); fists when unarmed
 *   weaponAps            main-hand attacks per second (1.0 unarmed)
 *   attackSpeed/castSpeed/moveSpeedPct/cdr/magicFindPct are capped
 * Everything else (damagePct, <type>DamagePct, critDamage, lifeSteal, ...) is the raw sum for the combat module's damage pipeline.
 */

export interface SpecialEntry {
  id: string;
  desc: string;
  params: Record<string, number>;
  source: 'talent' | 'unique' | 'set';
}

export interface StatCalcResult {
  stats: StatBlock;
  specials: Record<string, SpecialEntry>;
  /** Product of every "moreDamage" multiplier (keystones). */
  moreDamage: number;
  /** Equipped piece count per set id. */
  setCounts: Record<string, number>;
  hasShield: boolean;
  /** GDD_TALENTS §2.5: the talent layer (stats already folded into `stats`; mods, procs, grants for the systems). */
  fx: ActiveFx;
}

// ================================================================================================ talent layer
// GDD_TALENTS §2.5 / §3.2 / §6: the trees, web nodes, masteries, jewels and skill-specialisation picks fold through the
// effect DSL (parseFx) into one ActiveFx. Pure: a save in, data out. Numbers below are the §6.5 knobs (data, not logic).

/** §6.5 knob 2: multiplies every numeric tree stat at fold time, and the deviation from 1 of dmgx / cdx / radx. */
export const TALENT_POWER: number = 1;
/** §6.5 knob 4: scalar for the web nodes defined by GDD_TALENTS (nodes with `fx`: clusters, masteries, jewels). */
export const WEB_POWER: number = 1;
/** §6.5 knob 3: per-spec scalar for the spec tree stats (default 1). */
export const SPEC_SCALE: Partial<Record<SpecId, number>> = {};

/** §6.3 aggregate caps, applied to the SUM of all sources after the fold (the tree adds these ceilings). */
export const TALENT_STAT_CAPS: Partial<Record<StatId, number>> = {
  threatPct: 3,
  healingPct: 1,
  minionDamagePct: 1.5,
  minionHpPct: 1.5,
  guardGauge: 160,
  parryWindow: 0.2,
  finisherPct: 1.5,
  weakDamagePct: 1.5,
  flaskGainPct: 2,
  flaskEffectPct: 1,
  majorCdrPct: 0.35,
};

/** Mod ops written around 1: only their deviation from 1 scales with TALENT_POWER (§6.5). */
const SCALED_MOD_OPS = new Set<string>(['dmgx', 'cdx', 'radx']);

/** An empty talent fold (no build, or a failed fold). */
export function emptyFx(): ActiveFx {
  return { stats: {}, mods: [], procs: [], grants: [], bespoke: {} };
}

/** Parsed fx strings by text (the data is fixed, so each string is parsed once). */
const parsedFx = new Map<string, FxItem[]>();
const warnedFx = new Set<string>();

function itemsOf(fx: string): FxItem[] {
  let items = parsedFx.get(fx);
  if (!items) {
    const r = parseFx(fx);
    items = r.items;
    if (r.errors.length && !warnedFx.has(fx)) {
      warnedFx.add(fx);
      console.warn('[talents] fx parse errors', r.errors, fx);
    }
    parsedFx.set(fx, items);
  }
  return items;
}

function scaleMod(m: ModEntry): ModEntry {
  if (TALENT_POWER === 1 || !SCALED_MOD_OPS.has(m.op)) return m;
  const v = typeof m.v === 'number' ? m.v : Number(m.v);
  if (!Number.isFinite(v)) return m;
  return { ...m, v: 1 + (v - 1) * TALENT_POWER };
}

/**
 * Folds the items of one fx string into `acc`. `statScale` multiplies the S items. `modsOnly` keeps M (mods) and T
 * (skill-local procs) and drops S / G / X, which is the rule for skill-specialisation options (GDD_TALENTS §4.3).
 */
function foldItems(acc: ActiveFx, fx: string, src: string, statScale: number, modsOnly = false): void {
  itemsOf(fx).forEach((it, i) => {
    switch (it.k) {
      case 'S':
        if (!modsOnly) addStats(acc.stats, it.stats, statScale);
        break;
      case 'M':
        for (const m of collectMods([it], src)) acc.mods.push(scaleMod(m));
        break;
      case 'T':
        acc.procs.push({ id: `${src}#${i}`, on: it.trig, filter: it.filter, conds: it.conds, ch: it.ch, icd: it.icd, actions: it.actions, src });
        break;
      case 'G':
        if (!modsOnly && !acc.grants.includes(it.skill)) acc.grants.push(it.skill);
        break;
      case 'X':
        if (!modsOnly) {
          const b = (acc.bespoke[it.id] ??= {});
          for (const [k, v] of Object.entries(it.params)) b[k] = (b[k] ?? 0) + v;
        }
        break;
    }
  });
}

/** Folds the chosen options of a tree's allocation (`arr[i]`: P rank 0–2, choice 1 = A / 2 = B, others 0 / 1). */
function foldTree(acc: ActiveFx, tree: TreeDef | null, arr: readonly number[], statScale: number): void {
  if (!tree) return;
  tree.nodes.forEach((node, i) => {
    const v = arr[i] ?? 0;
    if (!v) return;
    if (node.type === 'P') {
      const value = node.stat ? PALETTE_VALUE[node.stat] : undefined;
      if (node.stat && value) acc.stats[node.stat] = (acc.stats[node.stat] ?? 0) + value * v * statScale;
      return;
    }
    const opt = node.options[node.options.length === 2 && v === 2 ? 1 : 0];
    if (opt) foldItems(acc, opt.fx, `${tree.id}/${node.slot}`, statScale);
  });
}

/**
 * The talent layer of a save (GDD_TALENTS §2.5 folding order, minus the support runes that V2 §4.1 adds afterwards):
 * spec `fx` → class tree → spec tree → skill-specialisation picks (mods and procs only) → allocated web nodes (`fx`),
 * chosen mastery options and socketed jewels. Reads the committed build (`tb.active[spec]`), not a staged draft.
 * Throws only when a tree cannot be built; `computeStats` guards that.
 */
export function collectFx(save: CharacterSave): ActiveFx {
  const acc = emptyFx();
  const spec = save.spec;
  const act = spec ? save.tb?.active[spec] : undefined;
  const specScale = spec ? SPEC_SCALE[spec] ?? 1 : 1;

  if (spec) {
    const sd = getSpec(spec);
    if (sd?.fx) foldItems(acc, sd.fx, `spec:${spec}`, specScale);
  }
  if (spec && act) {
    foldTree(acc, getTree('class', save.classId), act.cls, 1);
    foldTree(acc, getTree('spec', spec), act.spc, specScale);
    const sigs = SIGNATURE_SKILLS[save.classId] ?? [];
    sigs.forEach((skill, k) => {
      for (let tier = 1; tier <= 3; tier++) {
        const v = act.skl?.[k * 3 + tier - 1] ?? 0;
        if (v !== 1 && v !== 2) continue;
        if (masteryRankAt(save.skillMastery?.[skill] ?? 0, save.level) < tier) continue;
        const opt = v === 1 ? 'A' : 'B';
        for (const row of skillSpecsOf(skill)) {
          if (row.tier === tier && row.opt === opt) foldItems(acc, row.fx, `skill:${skill}#${tier}${opt}`, 1, true);
        }
      }
    });
  }

  const picks = save.passiveExtra?.picks ?? {};
  for (const id of save.talents) {
    const node = TALENT_NODES[id];
    if (!node) continue;
    if (node.fx) foldItems(acc, node.fx, `web:${id}`, WEB_POWER);
    if (node.kind === 'mastery' && node.choices?.length) {
      const idx = picks[id] ?? 0;
      const choice = node.choices[idx] ?? node.choices[0];
      if (choice) foldItems(acc, choice.fx, `web:${id}#${idx}`, WEB_POWER);
    }
    if (node.kind === 'socket') {
      const jewel = save.passiveExtra?.jewels?.[id];
      if (jewel) addStats(acc.stats, itemStats(jewel), WEB_POWER);
    }
  }
  return acc;
}

interface ClassTable {
  base: { str: number; dex: number; int: number; vit: number };
  growth: { str: number; dex: number; int: number; vit: number };
  hpPerLevel: number;
  hpPerVit: number;
  maxResource: number;
  resourceRegen: number;
  mainStat: StatId;
  /** Other class base stats (passive trait stats such as lifeSteal, maxResource BONUS...), folded into the gear sum. */
  extra: StatBlock;
}
export const FALLBACK_CLASS: Record<ClassId, ClassTable> = {
  knight: { base: { str: 14, dex: 10, int: 8, vit: 16 }, growth: { str: 3, dex: 1, int: 0, vit: 3 }, hpPerLevel: 12, hpPerVit: 10, maxResource: 100, resourceRegen: 4, mainStat: 'str', extra: {} },
  barbarian: { base: { str: 16, dex: 10, int: 6, vit: 16 }, growth: { str: 4, dex: 1, int: 0, vit: 2 }, hpPerLevel: 12, hpPerVit: 12, maxResource: 100, resourceRegen: 0, mainStat: 'str', extra: { lifeSteal: 0.005 } },
  mage: { base: { str: 6, dex: 10, int: 18, vit: 14 }, growth: { str: 0, dex: 1, int: 4, vit: 2 }, hpPerLevel: 8, hpPerVit: 9, maxResource: 100, resourceRegen: 5, mainStat: 'int', extra: {} },
  rogue: { base: { str: 10, dex: 18, int: 6, vit: 14 }, growth: { str: 1, dex: 4, int: 0, vit: 2 }, hpPerLevel: 10, hpPerVit: 9, maxResource: 100, resourceRegen: 12, mainStat: 'dex', extra: {} },
  // GDD_CLASSES_V2 §2.1–§6.1 (NC04): fallback rows; classTable() prefers the ClassDefX registry rows (data/classes.ts)
  monk: { base: { str: 10, dex: 16, int: 8, vit: 14 }, growth: { str: 1, dex: 4, int: 0, vit: 2 }, hpPerLevel: 11, hpPerVit: 10, maxResource: 100, resourceRegen: 10, mainStat: 'dex', extra: {} },
  archer: { base: { str: 8, dex: 18, int: 8, vit: 12 }, growth: { str: 0, dex: 4, int: 0, vit: 2 }, hpPerLevel: 9, hpPerVit: 9, maxResource: 100, resourceRegen: 8, mainStat: 'dex', extra: {} },
  paladin: { base: { str: 14, dex: 8, int: 10, vit: 16 }, growth: { str: 3, dex: 0, int: 1, vit: 3 }, hpPerLevel: 11, hpPerVit: 10, maxResource: 100, resourceRegen: 5, mainStat: 'str', extra: {} },
  necromancer: { base: { str: 6, dex: 8, int: 18, vit: 14 }, growth: { str: 0, dex: 1, int: 4, vit: 2 }, hpPerLevel: 8, hpPerVit: 9, maxResource: 100, resourceRegen: 7, mainStat: 'int', extra: {} },
  warlock: { base: { str: 6, dex: 8, int: 17, vit: 15 }, growth: { str: 0, dex: 1, int: 4, vit: 2 }, hpPerLevel: 8, hpPerVit: 9, maxResource: 100, resourceRegen: 6, mainStat: 'int', extra: {} },
};

/** Class table merged from combat's ClassDef (when present) over the GDD fallback. */
export function classTable(classId: ClassId): ClassTable {
  const fb = FALLBACK_CLASS[classId] ?? FALLBACK_CLASS.knight;
  const def = (CLASSES as Partial<Record<ClassId, { baseStats?: StatBlock; perLevel?: StatBlock; hpPerLevel?: number; hpPerVit?: number }>>)[classId];
  if (!def || !def.baseStats || def.baseStats.str === undefined) return fb;
  const b = def.baseStats, g = def.perLevel ?? {};
  const extra: StatBlock = {};
  for (const k of Object.keys(b) as StatId[]) {
    if (k === 'str' || k === 'dex' || k === 'int' || k === 'vit' || k === 'resourceRegen') continue;
    extra[k] = b[k];
  }
  return {
    base: { str: b.str ?? fb.base.str, dex: b.dex ?? fb.base.dex, int: b.int ?? fb.base.int, vit: b.vit ?? fb.base.vit },
    growth: { str: g.str ?? fb.growth.str, dex: g.dex ?? fb.growth.dex, int: g.int ?? fb.growth.int, vit: g.vit ?? fb.growth.vit },
    hpPerLevel: def.hpPerLevel ?? fb.hpPerLevel,
    hpPerVit: def.hpPerVit ?? fb.hpPerVit,
    maxResource: 100, // fixed pool; ClassDef.baseStats.maxResource is a BONUS (see data/classes.ts)
    resourceRegen: b.resourceRegen ?? fb.resourceRegen,
    mainStat: fb.mainStat,
    extra,
  };
}

export const ELEMENT_RES: StatId[] = ['resFire', 'resFrost', 'resLightning', 'resShadow', 'resPoison', 'resArcane'];

/** Active elixir ids of the save (one per category). Flags: `elixir.<cat>` (id) and `elixir.<cat>.left` (seconds). */
export function activeElixirs(save: CharacterSave): { id: string; left: number }[] {
  const out: { id: string; left: number }[] = [];
  for (const cat of ['war', 'guard', 'help']) {
    const id = save.flags['elixir.' + cat];
    const left = Number(save.flags[`elixir.${cat}.left`] ?? 0);
    if (typeof id === 'string' && id && left > 0) out.push({ id, left });
  }
  return out;
}

function registerSpecial(into: Record<string, SpecialEntry>, id: string, desc: string, params: Record<string, number> | undefined, source: SpecialEntry['source']): void {
  const ex = into[id];
  if (ex) return;
  into[id] = { id, desc, params: params ?? {}, source };
}

export function computeStats(save: CharacterSave): StatCalcResult {
  const classId = save.classId;
  const L = Math.max(1, save.level);
  const table = classTable(classId);
  const S: StatBlock = {};
  addStats(S, table.extra);
  const specials: Record<string, SpecialEntry> = {};
  const setCounts: Record<string, number> = {};
  let hasShield = false;

  // ---- gear
  for (const slot of EQUIP_SLOTS) {
    const it = save.equipment[slot];
    if (!it) continue;
    addStats(S, itemStats(it, slot));
    const base = baseOf(it);
    if (base?.category === 'shield' && slot === 'offhand') hasShield = true;
    if (it.setId) setCounts[it.setId] = (setCounts[it.setId] ?? 0) + 1;
    if (it.uniqueId && UNIQUES[it.uniqueId]?.special) {
      const sp = UNIQUES[it.uniqueId].special!;
      registerSpecial(specials, sp.id, sp.desc, sp.params, 'unique');
    }
  }
  // ---- set bonuses
  for (const [setId, count] of Object.entries(setCounts)) {
    const set = SETS[setId];
    if (!set) continue;
    for (const b of set.bonuses) {
      if (count < b.count) continue;
      if (b.stats) addStats(S, b.stats);
      if (b.special) registerSpecial(specials, b.special.id, b.special.desc, { count: b.count }, 'set');
    }
  }
  // ---- passive tree
  for (const id of save.talents) {
    const node = TALENT_NODES[id];
    if (!node) continue;
    if (node.classStart === classId) continue; // own start is free and grants nothing
    if (node.stats) addStats(S, node.stats);
    if (node.special) registerSpecial(specials, node.special.id, node.special.desc, node.special.params, 'talent');
  }
  // ---- spec passive (GDD_TALENTS §2.1: SpecDef.stats / specials, granted at the L10 choice)
  const specDef = save.spec ? getSpec(save.spec) : undefined;
  if (specDef) {
    if (specDef.stats) addStats(S, specDef.stats);
    for (const sp of specDef.specials ?? []) registerSpecial(specials, sp.id, sp.desc, sp.params, 'talent');
  }
  // ---- talent layer: trees, web fx, masteries, jewels, skill picks (GDD_TALENTS §2.5); a failed fold keeps the rest
  let fx: ActiveFx = emptyFx();
  try {
    fx = collectFx(save);
  } catch (e) {
    console.error('[talents] talent fold failed', e);
  }
  addStats(S, fx.stats, TALENT_POWER);
  // X items (bespoke specials) add to the params of an existing special; a copy, never the data object
  for (const [id, add] of Object.entries(fx.bespoke)) {
    const sp = specials[id];
    if (!sp) continue;
    const params: Record<string, number> = { ...sp.params };
    for (const [k, v] of Object.entries(add)) params[k] = (params[k] ?? 0) + v;
    specials[id] = { ...sp, params };
  }
  // ---- elixirs
  for (const e of activeElixirs(save)) {
    const d = getMaterial(e.id);
    if (d?.elixir) addStats(S, d.elixir.stats);
  }
  // ---- Av Defteri (GDD_OPENWORLD 6.4): permanent bonus of every delivered step (flag world.bio = steps done)
  const avSteps = Math.min(AV_DEFTERI.length, Math.max(0, Math.floor(Number(save.flags['world.bio'] ?? 0))));
  for (let i = 0; i < avSteps; i++) addStats(S, AV_DEFTERI[i].stats);

  // ---- GDD_TALENTS §6.3: aggregate caps of the summed stats (all sources), applied after the sum
  for (const k of Object.keys(TALENT_STAT_CAPS) as StatId[]) {
    const cap = TALENT_STAT_CAPS[k];
    if (cap !== undefined && (S[k] ?? 0) > cap) S[k] = cap;
  }

  // ---- "more" multipliers & keystone flags
  let moreDamage = 1, moreHp = 1;
  for (const sp of Object.values(specials)) {
    if (sp.params.moreDamage) moreDamage *= sp.params.moreDamage;
    if (sp.params.moreHp) moreHp *= sp.params.moreHp;
  }
  const flag = (id: string, key: string) => specials[id]?.params[key];

  const out: StatBlock = {};
  // raw copy (everything not specifically derived below stays as the raw sum)
  for (const k of Object.keys(S) as StatId[]) out[k] = S[k];

  // ---- primary attributes
  const allAttr = S.allAttr ?? 0;
  const str = table.base.str + table.growth.str * (L - 1) + (S.str ?? 0) + allAttr;
  const dex = table.base.dex + table.growth.dex * (L - 1) + (S.dex ?? 0) + allAttr;
  const int = table.base.int + table.growth.int * (L - 1) + (S.int ?? 0) + allAttr;
  const vit = table.base.vit + table.growth.vit * (L - 1) + (S.vit ?? 0) + allAttr;
  out.str = Math.round(str); out.dex = Math.round(dex); out.int = Math.round(int); out.vit = Math.round(vit);
  out.allAttr = 0;

  // ---- health
  out.maxHp = Math.max(10, Math.round((50 + table.hpPerLevel * L + vit * table.hpPerVit + (S.maxHp ?? 0)) * (1 + (S.maxHpPct ?? 0)) * moreHp));
  out.maxHpPct = 0;
  let hpRegen = (S.hpRegen ?? 0) + (S.hpRegenPct ?? 0) * out.maxHp;
  if (flag('ks_blood_sacrifice', 'noHpRegen')) hpRegen = 0;
  out.hpRegen = +hpRegen.toFixed(2);
  out.hpRegenPct = 0;

  // ---- armour & offence helpers
  out.armor = Math.round((2 * str + (S.armor ?? 0)) * (1 + (S.armorPct ?? 0)));
  out.armorPct = 0;
  out.critChance = clamp(0.05 + 0.0002 * dex + (S.critChance ?? 0), 0, 0.75);
  if (flag('ks_steady_hand', 'noCrit')) out.critChance = 0;
  out.critDamage = S.critDamage ?? 0;
  let dodge = clamp(0.0001 * dex + (S.dodgeChance ?? 0), 0, 0.4);
  if (flag('ks_iron_fortress', 'dodgeZero')) dodge = 0;
  out.dodgeChance = dodge;
  // ---- block
  let block = 0;
  if (hasShield) {
    block = (S.blockChance ?? 0) + (classId === 'knight' ? 0.1 : 0);
    const mult = flag('ks_iron_fortress', 'blockChanceMult');
    if (mult) block *= mult;
    block = clamp(block, 0, flag('ks_iron_fortress', 'blockCap') ?? 0.5);
  }
  out.blockChance = block;
  out.blockAmount = 0.6 + (S.blockAmount ?? 0);

  // ---- resists
  const resAll = S.resAll ?? 0;
  const resCapBonus = 0;
  for (const k of ELEMENT_RES) out[k] = clamp((S[k] ?? 0) + resAll + 0.0005 * int, -1, 0.75 + resCapBonus);
  out.resAll = 0;

  // ---- speeds / caps
  out.attackSpeed = Math.min(S.attackSpeed ?? 0, 1);
  out.castSpeed = Math.min(S.castSpeed ?? 0, 1);
  out.moveSpeedPct = Math.min(S.moveSpeedPct ?? 0, 0.75);
  out.cdr = Math.min(S.cdr ?? 0, 0.4);
  out.costReductionPct = Math.min(S.costReductionPct ?? 0, 0.4);
  out.magicFindPct = Math.min(S.magicFindPct ?? 0, 2.5);
  out.ccReductionPct = Math.min(S.ccReductionPct ?? 0, 0.6);
  out.armorPen = Math.min(S.armorPen ?? 0, 0.5);

  // ---- life steal / potions
  let ls = S.lifeSteal ?? 0;
  const lsMult = flag('ks_blood_sacrifice', 'lifeStealMult');
  if (lsMult) ls *= lsMult;
  out.lifeSteal = ls;
  const potMult = flag('ks_blood_sacrifice', 'potionMult');
  out.potionPct = potMult ? (1 + (S.potionPct ?? 0)) * potMult - 1 : S.potionPct ?? 0;

  // ---- resource
  const isMage = classId === 'mage';
  out.maxResource = Math.round(table.maxResource + (isMage ? 0.25 * int : 0) + (S.maxResource ?? 0));
  out.resourceRegen = +(((table.resourceRegen + (isMage ? 0.015 * int : 0) + (S.resourceRegen ?? 0)) * (1 + (S.resourceRegenPct ?? 0)))).toFixed(3);
  out.resourceRegenPct = 0;

  // ---- weapon
  let wMin = S.weaponMin ?? 0, wMax = S.weaponMax ?? 0;
  if (wMax <= 0) {
    wMin = Math.round(1 + L * 0.5);
    wMax = Math.round(3 + L * 0.8);
  }
  out.weaponMin = Math.round(wMin);
  out.weaponMax = Math.round(Math.max(wMin, wMax));
  out.weaponAps = S.weaponAps && S.weaponAps > 0 ? S.weaponAps : 1;

  // ---- misc
  out.pickupRadius = (S.pickupRadius ?? 0) + (specials['leg_merchant_kings_ring']?.params.magnetBonus ?? 0);

  return { stats: out, specials, moreDamage, setCounts, hasShield, fx };
}
