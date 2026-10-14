/**
 * Second-bar defaults (Shift+1..8, ExtraBars.ts bar2) for the defensive and utility rows that have no main-bar slot in their spec
 * (docs/WOW_ABILITY_MAP.md marks them "Shift+"). Index 0 is cell 1. Seeded by barDrop.readBars() once per save, while the save has
 * no bar2 entry; the player can move or clear the cells afterwards. Each id is in its spec's skill list (kit sims check this).
 */
import type { SpecId } from '../types/v2';

export const DEFAULT_BAR2_BY_SPEC: Partial<Record<SpecId, string[]>> = {
  knight_protector: ['knight_spell_reflection'],
  archer_marksman: ['archer_exhilaration', 'archer_misdirection'],
  archer_beastmaster: ['archer_exhilaration', 'archer_misdirection'],
  archer_survival: ['archer_exhilaration', 'archer_misdirection'],
  monk_brewmaster: ['monk_celestial_brew'],
  monk_mistweaver: ['monk_life_cocoon'],
  paladin_protection: ['paladin_blessing_protection', 'paladin_blessing_freedom'],
  paladin_holy: ['paladin_beacon_of_light', 'paladin_blessing_protection', 'paladin_blessing_freedom'],
  paladin_retribution: ['paladin_blessing_protection', 'paladin_blessing_freedom'],
  priest_holy: ['priest_holy_fire'],
  shaman_restoration: ['shaman_spirit_link'],
};
