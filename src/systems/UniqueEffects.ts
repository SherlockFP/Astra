import { G } from '../game/G';
import { UNIQUES } from '../data/uniques';
import { LEGACY_WIRED_UNIQUES, UNIQUE_FX, type UniqueFxDef } from '../data/uniqueFx';
import { parseFx } from '../data/talentTrees/fx';
import { EQUIP_SLOTS } from '../types/items';
import { addStats } from '../types/stats';
import type { CharacterSave } from '../types/character';
import type { ActiveFx, FxItem } from '../types/talents';

/**
 * Loot V3: effects of equipped uniques (GDD_LOOT_V3 §3.2, §10.3). OWNER: items module.
 *
 * An equipped unique with an fx row (data/uniqueFx.ts) contributes to the same ActiveFx as the talent layer:
 *   S rows  → fx.stats (folded into the final StatBlock by computeStats)
 *   T rows  → fx.procs, source `item:<slot>:<uniqueId>#<i>` (CharacterState.recomputeStats hands them to G.procs.setEntries)
 * Equip / unequip / upgrade / respec all end in recomputeStats (→ `player:stats`), so the proc rows follow the gear without any
 * extra sync, and no Combat / SkillSystem code knows about uniques. A `broken` item (Kırık) contributes nothing, and the same
 * unique worn twice (two rings) folds once.
 *
 * Runtime bridge (lazy, started by the first LootSystem frame): the proc triggers the combat code does not emit are derived
 * here from events and the player state: `roll` (dodge roll started), `break` (an enemy's posture broke while the local player
 * is a contributor), `kick` (the local player interrupted a cast: enemy:castEnd.interruptedBy).
 */

const parsed = new Map<string, FxItem[]>();
const warned = new Set<string>();

function itemsOf(fx: string): FxItem[] {
  let items = parsed.get(fx);
  if (!items) {
    const r = parseFx(fx);
    items = r.items;
    if (r.errors.length && !warned.has(fx)) {
      warned.add(fx);
      console.warn('[unique-fx] fx parse errors', r.errors, fx);
    }
    parsed.set(fx, items);
  }
  return items;
}

/** The fx definition of a unique, or undefined (legacy / stat-only / unknown). */
export function uniqueFxDef(uniqueId: string): UniqueFxDef | undefined {
  return UNIQUE_FX[uniqueId];
}

/** 'legacy' = coded in combat; 'full' / 'approx' = an fx row is folded while equipped; 'inactive' = needs engine; 'none' = no special. */
export type UniqueEffectState = 'legacy' | 'full' | 'approx' | 'inactive' | 'none';

export function uniqueEffectState(uniqueId: string): UniqueEffectState {
  const u = UNIQUES[uniqueId];
  if (!u?.special) return 'none';
  if (LEGACY_WIRED_UNIQUES.includes(uniqueId)) return 'legacy';
  const d = UNIQUE_FX[uniqueId];
  if (!d || d.mode === 'engine' || !d.fx) return 'inactive';
  return d.mode;
}

/** Tooltip line of a unique's effect: the Turkish text and whether it works in the game ("(etkin değil)" otherwise). */
export function describeUniqueEffect(uniqueId: string): { text: string; active: boolean } | null {
  const u = UNIQUES[uniqueId];
  if (!u?.special) return null;
  const st = uniqueEffectState(uniqueId);
  if (st === 'full' || st === 'approx') return { text: UNIQUE_FX[uniqueId].effect ?? u.special.desc, active: true };
  if (st === 'legacy') return { text: u.special.desc, active: true };
  return { text: u.special.desc, active: false };
}

/**
 * Folds the fx rows of the equipped uniques into `acc` (stats and procs). Returns the number of uniques that contributed.
 * Pure: a save in, data out.
 */
export function foldEquippedUniques(acc: ActiveFx, save: CharacterSave): number {
  const seen = new Set<string>();
  let n = 0;
  for (const slot of EQUIP_SLOTS) {
    const it = save.equipment[slot];
    if (!it || !it.uniqueId || it.broken || seen.has(it.uniqueId)) continue;
    const d = UNIQUE_FX[it.uniqueId];
    if (!d?.fx || d.mode === 'engine') continue;
    seen.add(it.uniqueId);
    n++;
    const src = `item:${slot}:${it.uniqueId}`;
    itemsOf(d.fx).forEach((row, i) => {
      if (row.k === 'S') addStats(acc.stats, row.stats, 1);
      else if (row.k === 'T') {
        acc.procs.push({ id: `${src}#${i}`, on: row.trig, filter: row.filter, conds: row.conds, ch: row.ch, icd: row.icd, actions: row.actions, src });
      }
    });
  }
  return n;
}

// ================================================================================================ runtime bridge
let bridged = false;
let rolling = false;

function emitBridge(trigger: string, enemyId: number): void {
  const p = G.player;
  if (!p || !p.isLocal || p.isDead || !G.procs) return;
  const target = G.world?.getActor(enemyId) ?? null;
  G.procs.emit(trigger, { player: p, target });
}

function startBridge(): void {
  bridged = true;
  const ev = G.events;
  if (!ev) return;
  ev.on('poise:break', ({ enemyId }) => {
    if (G.loot?.contributed(enemyId)) emitBridge('break', enemyId);
  });
  ev.on('enemy:castEnd', ({ enemyId, interrupted, interruptedBy }) => {
    if (interrupted && interruptedBy !== undefined && interruptedBy === G.player?.id) emitBridge('kick', enemyId);
  });
}

/** Called every frame by LootSystem (a world exists): lazy event wiring and the `roll` trigger. Never throws. */
export function tickUniqueEffects(): void {
  try {
    if (!bridged) startBridge();
    const p = G.player;
    if (!p) return;
    const now = !!p.dodging;
    if (now && !rolling) G.procs?.emit('roll', { player: p });
    rolling = now;
  } catch (e) {
    if (!warned.has('tick')) {
      warned.add('tick');
      console.warn('[unique-fx] bridge failed', e);
    }
  }
}

/** Test hook: forget the bridge state (a new EventBus / scene). */
export function resetUniqueBridge(): void {
  bridged = false;
  rolling = false;
}
