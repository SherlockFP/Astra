import type { DungeonDef } from '../../types/dungeons';
import { FISSURE_VERSION, fissureId, parseFissureId } from './ids';
import { generateFissure } from './generate';

/**
 * Kadim Yarıklar (procedural dungeons) public API. OWNER: world module. See docs/GDD_PROCGEN.md and docs/kits/procgen_status.md.
 * getDungeon(id) in data/dungeons/index.ts calls getFissureDef for every `fis.` id.
 */
export { FISSURE_VERSION, FISSURE_THEMES, FISSURE_TIER_IDS, fissureId, parseFissureId, isFissureId, difficultyOfTier, tierOfDifficulty, clampLevel, type FissureSpec } from './ids';
export { generateFissure, TIER_HEIGHT } from './generate';
export {
  FISSURE_TIERS, FISSURE_TIER_ORDER, FISSURE_MODS, FISSURE_MOD_ORDER, FISSURE_THEME_NAMES, fissureScaling, fissureEnemyLevel, fissureUnlock, fissureEndRewards,
  fissureItemLevel, fissureClearFlag, fissureBestFlag,
} from './tiers';
export { THEMES } from './themes';
export { BOSS_POOLS, ARENAS } from './arenas';

/** Last generated maps (a run reads its def many times per second: kills, loot, minimap). */
const cache = new Map<string, DungeonDef>();
const CACHE_MAX = 4;

/**
 * The generated DungeonDef of a fissure id; undefined for a malformed id, another generator version (fails closed, the caller shows
 * the usual "Bilinmeyen zindan" message) or an unexpected failure (never throws).
 */
export function getFissureDef(id: string): DungeonDef | undefined {
  const hit = cache.get(id);
  if (hit) {
    cache.delete(id);
    cache.set(id, hit);
    return hit;
  }
  const spec = parseFissureId(id);
  if (!spec || spec.v !== FISSURE_VERSION) return undefined;
  try {
    const def = generateFissure(spec);
    cache.set(id, def);
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
    return def;
  } catch (e) {
    console.warn('[fissure] generation failed', id, e);
    return undefined;
  }
}
