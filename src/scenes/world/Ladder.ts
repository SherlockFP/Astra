import { G } from '../../game/G';
import { getDungeon } from '../../data/dungeons';
import type { RunState } from '../../types/mythic';
import { isFissureId } from '../../world/procgen';

/**
 * Difficulty ladder bookkeeping (GDD_OPENWORLD §7.3, §7.6): the unlock announcements that follow a clear and the flags the
 * keystone panel reads. The gates themselves (level, clear flags, keystone) are Bounties.hasCleared / the keystone panel; the
 * key chase (+1/+2/+3 after a timed run) is MythicPlus.applyKeyResult. This module only reacts to `run:completed`.
 * Flags written: `ladder.heroic.<id>` and `ladder.mythic.<id>` (announced once), `m0.best.<id>` (best Mitik 0 time, seconds),
 * `ladder.keygrant` (a Mitik 0 run left the character with a key). OWNER: scenes module.
 */

/** Turkish strings of the ladder (GDD_OPENWORLD §7.6). Exported for the keystone panel. */
export const LADDER_TR = {
  heroicUnlocked: (zone: string) => `Kahramanlık açıldı: ${zone}.`,
  mythicUnlocked: (zone: string) => `Mitik 0 açıldı: ${zone}.`,
  mythicAtLevel: 'Mitik 0, 60. seviyede açılır.',
  needLevel: (zone: string, n: number) => `${zone} için ${n}. seviye gerekir.`,
  needClearNormal: (zone: string) => `Kahramanlık, ${zone} Normal'de bir kez bitirildikten sonra açılır.`,
  needClearHeroic: (zone: string) => `Mitik 0, ${zone} Kahramanlık'ta bitirildikten sonra açılır.`,
  needKey: "Mitik+ için Kadim Anahtar Taşı gerekir. Önce Mitik 0'ı bitir.",
} as const;

/** Mitik 0 level (GDD §7.2). */
const MYTHIC_LEVEL = 60;

let hooked = false;

/** Subscribe once to run completion (idempotent). Called from DungeonScene.enter. */
export function initLadder(): void {
  if (hooked || !G.events) return;
  hooked = true;
  G.events.on('run:completed', ({ state }) => {
    try {
      onRunCompleted(state);
    } catch (e) {
      console.warn('[ladder] run bookkeeping failed', e);
    }
  });
}

/** One announcement per flag; the flag is written before the toast so a reload never repeats it. */
function once(key: string, fn: () => void): void {
  const ch = G.character;
  if (!ch || ch.save.flags[key] === true) return;
  ch.save.flags[key] = true;
  ch.persist();
  fn();
}

/** Exported for tests / the dev page: the bookkeeping of one finished run (not failed runs). */
export function onRunCompleted(state: RunState | null | undefined): void {
  const ch = G.character;
  if (!ch || !state || state.failed) return;
  const id = state.dungeonId;
  if (isFissureId(id)) return; // Kadim Yarıklar never unlock ladder steps or write m0.best (one id per seed)
  const zone = getDungeon(id)?.name ?? id;
  const flags = ch.save.flags;
  if (state.difficulty === 'normal') {
    once(`ladder.heroic.${id}`, () => G.ui.toast(LADDER_TR.heroicUnlocked(zone), 'success'));
  } else if (state.difficulty === 'heroic') {
    once(`ladder.mythic.${id}`, () => G.ui.toast(ch.level >= MYTHIC_LEVEL ? LADDER_TR.mythicUnlocked(zone) : LADDER_TR.mythicAtLevel, 'success'));
  } else if (state.difficulty === 'mythic') {
    const t = Math.max(1, Math.round(state.elapsed));
    const prev = flags[`m0.best.${id}`];
    if (typeof prev !== 'number' || t < prev) flags[`m0.best.${id}`] = t;
    if (ch.save.mythic.keystone && flags['ladder.keygrant'] !== true) flags['ladder.keygrant'] = true;
    ch.persist();
  }
}
