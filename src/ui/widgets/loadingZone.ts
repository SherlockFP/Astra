import { getDungeon } from '../../data/dungeons';
import type { DungeonParams } from '../../scenes/scenes';
import type { SceneId } from '../../types/common';

/**
 * What the loading screen shows for a scene change (WoW-style): zone name, level band line and a backdrop picture.
 * The art is an existing sky panorama from public/assets/sky (no new assets).
 */
export interface LoadingZone {
  name: string;
  /** Second line under the name: "Sv. 30–45", or a short note for zones without a level band. */
  band: string;
  /** Backdrop image URL (CSS background, cover). */
  art: string;
}

const SKY = '/assets/sky/itch/psx-skyboxes-free/';
const ART_TOWN = SKY + 'sunset-clouds.png';
const ART_DUNGEON = SKY + 'night-moon.png';
const ART_WORLD = SKY + 'fog-grey.png';
const ART_ARENA = SKY + 'space-nebula.png';

/** "Sv. 30–45", or "Sv. 60" when the band is one level. */
export function levelBandText(range: readonly [number, number] | undefined): string {
  if (!range) return '';
  const [lo, hi] = range;
  return lo === hi ? `Sv. ${lo}` : `Sv. ${lo}–${hi}`;
}

/** Zone for a scene about to be entered; null for scenes without a loading screen of their own (menu, boot). */
export function zoneFor(id: SceneId, params?: unknown): LoadingZone | null {
  if (id === 'town') return { name: 'Kuzgunkale', band: 'Güvenli Bölge', art: ART_TOWN };
  if (id !== 'dungeon') return null;
  const p = (params ?? {}) as Partial<DungeonParams>;
  if (p.arena) return { name: 'PvP Arenası', band: 'Sıralamalı Maç', art: ART_ARENA };
  const def = p.dungeonId ? getDungeon(p.dungeonId) : undefined;
  if (!def) return { name: 'Kadim Zindan', band: '', art: ART_DUNGEON };
  return {
    name: def.name,
    band: levelBandText(def.levelRange),
    art: def.loadingImage ?? (def.world || def.outdoor ? ART_WORLD : ART_DUNGEON),
  };
}
