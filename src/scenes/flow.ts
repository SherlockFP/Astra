/**
 * Scene-to-scene breadcrumb: SceneManager.go() hands enter() no `from`, and some callers (the Esc game menu) always ask the town
 * for `spawnAt: 'portal'`. DungeonScene records here whether the scene it just left was the open world (Sisli Koru), so TownScene can
 * put the player back at the south gate instead of in the Kadim Kapılar Salonu.
 * OWNER: scenes module.
 */
import type { DungeonParams } from './scenes';
import { getDungeon } from '../data/dungeons';

/**
 * `returnTo` is set by a world entrance (GDD_OPENWORLD §9.3 point 5): the dungeon's exit portal sends the party back to that
 * open-world spawn instead of the town. Not yet read by any scene (WP6).
 */
export const sceneFlow: { leftOpenWorld: boolean; /** id of the open-world map just left (TownScene picks its gate) */ leftWorldId?: string; returnTo?: DungeonParams['returnTo'] } = { leftOpenWorld: false };

/**
 * True for open-world MAPS (a DungeonDef with `world`, i.e. Sisli Vadi). Use this instead of ad-hoc `getDungeon(id)?.outdoor` checks.
 * Kuzgunkale, the dungeons and the legacy Sisli Koru zone (no `world`) are NOT open-world maps.
 */
export const isOpenWorld = (id: string | null | undefined): boolean => !!id && getDungeon(id)?.world != null;

/**
 * True for an INSTANCED dungeon run: the 'dungeon' scene that is not an open-world map (dungeons, raids, M+, Kadim Yarıklar).
 * The open world (Sisli Vadi, Karakır, Ayaz) also runs in the 'dungeon' scene, so `scene === 'dungeon'` alone is not enough.
 */
export const isInstanceScene = (scene: string | null | undefined, dungeonId: string | null | undefined): boolean =>
  scene === 'dungeon' && !isOpenWorld(dungeonId);
