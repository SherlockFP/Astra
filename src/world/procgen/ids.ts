import type { FissureThemeId, FissureTier } from '../../types/dungeons';

/**
 * Kadim Yarıklar id codec (docs/GDD_PROCGEN.md D2). OWNER: world module. Pure, no imports besides types, so every layer
 * (MythicPlus, Bounties, UI, node tools) may use it without cycles.
 *
 * A generated map's dungeonId is self-describing: `fis.<theme>.<tier>.<level>.<seed8>.<v>` (e.g. `fis.crypt.h.35.1a2b3c4d.1`).
 * getDungeon(id) regenerates the identical DungeonDef from it on every peer; nothing else has to travel over the net.
 */

/** Bump on ANY change that alters generator output (tables, weights, RNG stage names): old ids then fail closed. */
export const FISSURE_VERSION = 1;

export const FISSURE_THEMES: readonly FissureThemeId[] = ['crypt', 'forge', 'frost', 'shadow'];
export const FISSURE_TIER_IDS: readonly FissureTier[] = ['n', 'h', 'm'];

export interface FissureSpec {
  theme: FissureThemeId;
  tier: FissureTier;
  /** Enemy level 1..60 (pack sizes scale with it; the same number is DungeonParams.enemyLevel). */
  level: number;
  /** uint32. */
  seed: number;
  v: number;
}

const ID_RE = /^fis\.(crypt|forge|frost|shadow)\.([nhm])\.(\d{1,2})\.([0-9a-f]{8})\.(\d{1,3})$/;

export const clampLevel = (n: number): number => Math.max(1, Math.min(60, Math.floor(Number.isFinite(n) ? n : 1)));

export function fissureId(s: FissureSpec): string {
  return `fis.${s.theme}.${s.tier}.${clampLevel(s.level)}.${(s.seed >>> 0).toString(16).padStart(8, '0')}.${Math.max(0, Math.floor(s.v))}`;
}

/** null when the id is not a well formed fissure id. */
export function parseFissureId(id: string): FissureSpec | null {
  const m = ID_RE.exec(id);
  if (!m) return null;
  const level = parseInt(m[3], 10);
  if (level < 1 || level > 60) return null;
  return { theme: m[1] as FissureThemeId, tier: m[2] as FissureTier, level, seed: parseInt(m[4], 16) >>> 0, v: parseInt(m[5], 10) };
}

/** Cheap prefix test used by the guards in MythicPlus / Bounties / Ladder / LootSystem. */
export const isFissureId = (id: string | null | undefined): boolean => typeof id === 'string' && id.startsWith('fis.');

/** DungeonParams.difficulty of a tier (never 'mythicplus'). */
export const difficultyOfTier = (t: FissureTier): 'normal' | 'heroic' | 'mythic' => (t === 'n' ? 'normal' : t === 'h' ? 'heroic' : 'mythic');
export const tierOfDifficulty = (d: string): FissureTier => (d === 'heroic' ? 'h' : d === 'mythic' ? 'm' : 'n');
