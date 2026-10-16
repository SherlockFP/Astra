/**
 * Second-bar defaults (Shift+1..8, ExtraBars.ts bar2) for the defensive and utility rows that have no main-bar slot in their spec
 * (docs/WOW_ABILITY_MAP.md marks them "Shift+"). Index 0 is cell 1. Seeded by barDrop.readBars() once per save, while the save has
 * no bar2 entry; the player can move or clear the cells afterwards. Each id is in its spec's skill list (kit sims check this).
 */
import type { SpecId } from '../types/v2';
import type { BarCell } from '../types/character';
import { MOUNT_CALL_ID } from './mounts';

export const DEFAULT_BAR2_BY_SPEC: Partial<Record<SpecId, string[]>> = {
  knight_protector: ['knight_spell_reflection'],
  archer_marksman: ['archer_exhilaration', 'archer_misdirection'],
  archer_beastmaster: ['archer_exhilaration', 'archer_misdirection'],
  archer_survival: ['archer_exhilaration', 'archer_misdirection'],
  monk_brewmaster: ['monk_celestial_brew'],
  monk_mistweaver: ['monk_life_cocoon', 'monk_mw_soothing_mist'],
  paladin_protection: ['paladin_blessing_protection', 'paladin_blessing_freedom'],
  paladin_holy: ['paladin_beacon_of_light', 'paladin_blessing_protection', 'paladin_blessing_freedom', 'paladin_divine_steed'],
  paladin_retribution: ['paladin_blessing_protection', 'paladin_blessing_freedom'],
  priest_holy: ['priest_holy_sanctify', 'priest_holy_mending'],
  shaman_restoration: ['shaman_purify_spirit', 'shaman_spirit_link'],
  druid_restoration: ['druid_natures_cure', 'druid_rebirth'],
  evoker_preservation: ['evoker_obsidian_scales'],
};

/**
 * The bar2 row a new save starts with: the spec's defensive skills in their cells, then the mount summon cell in the next free
 * cell (every spec, so every character has it). Index 0 is cell 1. barDrop.readBars seeds it once; `migrateMountCell` gives the
 * same cell to a save that is older than this row.
 */
export function defaultBar2Cells(spec: SpecId | undefined): BarCell[] {
  const skills: BarCell[] = (spec ? DEFAULT_BAR2_BY_SPEC[spec] ?? [] : []).map((id) => ({ k: 'skill' as const, id }));
  return [...skills, { k: 'mat' as const, id: MOUNT_CALL_ID }];
}
