import type { GemDef } from '../types/items';
import { GEM_COLORS, GEM_TYPE_NAMES, type GemType } from './materials';

/**
 * Gem effects by socket category (GDD_SYSTEMS 5.5). Values are indexed by grade 1..6 -> [0..5] and stored in data units
 * (percent stats = fractions). Weapon sockets: weapon, offhand dagger; armour sockets: armour pieces, shields, tomes; jewelry sockets: amulet/ring/belt.
 * OWNER: items module.
 */
const p = (a: number[]) => a.map((v) => +(v / 100).toFixed(5));

export const GEMS: Record<string, GemDef> = {
  gem_ruby: {
    id: 'gem_ruby', name: GEM_TYPE_NAMES.ruby, color: GEM_COLORS.ruby, stat: 'weaponMax', values: p([4, 6, 8, 10, 13, 16]),
    weapon: { stats: [], local: 'wpnDamagePct', values: p([4, 6, 8, 10, 13, 16]) },
    armor: { stats: ['str'], values: [5, 10, 16, 24, 34, 45] },
    jewelry: { stats: ['resFire'], values: p([4, 6, 8, 10, 13, 16]) },
  },
  gem_emerald: {
    id: 'gem_emerald', name: GEM_TYPE_NAMES.emerald, color: GEM_COLORS.emerald, stat: 'critDamage', values: p([6, 10, 15, 20, 26, 32]),
    weapon: { stats: ['critDamage'], values: p([6, 10, 15, 20, 26, 32]) },
    armor: { stats: ['dex'], values: [5, 10, 16, 24, 34, 45] },
    jewelry: { stats: ['resPoison'], values: p([4, 6, 8, 10, 13, 16]) },
  },
  gem_sapphire: {
    id: 'gem_sapphire', name: GEM_TYPE_NAMES.sapphire, color: GEM_COLORS.sapphire, stat: 'resourceRegenPct', values: p([6, 9, 12, 15, 19, 24]),
    weapon: { stats: ['resourceRegenPct'], values: p([6, 9, 12, 15, 19, 24]) },
    armor: { stats: ['int'], values: [5, 10, 16, 24, 34, 45] },
    jewelry: { stats: ['resFrost'], values: p([4, 6, 8, 10, 13, 16]) },
  },
  gem_topaz: {
    id: 'gem_topaz', name: GEM_TYPE_NAMES.topaz, color: GEM_COLORS.topaz, stat: 'attackSpeed', values: p([2, 3, 4, 5, 6, 8]),
    weapon: { stats: ['attackSpeed', 'castSpeed'], values: p([2, 3, 4, 5, 6, 8]) },
    armor: { stats: ['vit'], values: [5, 10, 16, 24, 34, 45] },
    jewelry: { stats: ['resLightning'], values: p([4, 6, 8, 10, 13, 16]) },
  },
  gem_amethyst: {
    id: 'gem_amethyst', name: GEM_TYPE_NAMES.amethyst, color: GEM_COLORS.amethyst, stat: 'lifeSteal', values: p([0.3, 0.5, 0.8, 1.1, 1.5, 2.0]),
    weapon: { stats: ['lifeSteal'], values: p([0.3, 0.5, 0.8, 1.1, 1.5, 2.0]) },
    armor: { stats: ['maxHpPct'], values: p([1, 2, 3, 4, 5, 6]) },
    jewelry: { stats: ['resShadow'], values: p([4, 6, 8, 10, 13, 16]) },
  },
  gem_diamond: {
    id: 'gem_diamond', name: GEM_TYPE_NAMES.diamond, color: GEM_COLORS.diamond, stat: 'eliteDamagePct', values: p([4, 6, 8, 10, 13, 16]),
    weapon: { stats: ['eliteDamagePct'], values: p([4, 6, 8, 10, 13, 16]) },
    armor: { stats: ['resAll'], values: p([2, 3, 4, 5, 6, 8]) },
    jewelry: { stats: ['cdr'], values: p([1, 1.5, 2, 2.5, 3, 4]) },
  },
};

export const getGem = (type: string): GemDef | undefined => GEMS['gem_' + type];

/** Parse a gem material id ('gem_ruby_3') into its definition and grade. */
export function parseGemId(id: string | null | undefined): { type: GemType; grade: number; def: GemDef } | null {
  if (!id) return null;
  const m = /^gem_([a-z]+)_([1-6])$/.exec(id);
  if (!m) return null;
  const def = GEMS['gem_' + m[1]];
  return def ? { type: m[1] as GemType, grade: Number(m[2]), def } : null;
}
