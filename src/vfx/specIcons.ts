/**
 * GDD_TALENTS §7.2 T19: spec icons for the talent UI, the player frame and the party frames.
 * No spec has its own glyph yet, so each spec falls back to its class icon. The UI tints it by role (SPEC_ROLE_TINT, §5.7).
 * Paths match CLASS_META in ui/panels/game/base.ts (kept in step by hand; this file imports types only).
 * OWNER: vfx-audio. Unknown spec ids return '' from specIcon() and never throw.
 */
import type { ClassId } from '../types/common';
import type { RoleId, SpecId } from '../types/v2';

/** Class icon path per class (the fallback icon of every spec of that class). */
export const CLASS_ICON_PATH: Record<ClassId, string> = {
  knight: '/assets/icons/class-knight.svg',
  barbarian: '/assets/icons/class-barbarian.svg',
  mage: '/assets/icons/class-mage.svg',
  rogue: '/assets/icons/class-rogue.svg',
  monk: '/assets/icons/buff-strength.svg',
  archer: '/assets/icons/class-ranger.svg',
  paladin: '/assets/icons/class-cleric.svg',
  necromancer: '/assets/icons/skill-summon-skeleton.svg',
  warlock: '/assets/icons/skill-curse.svg',
  demonhunter: '/assets/icons/skill-claw-strike.svg', // CM1 stub (İblis Avcısı)
  evoker: '/assets/icons/skill-fire-breath.svg',      // CM1 stub (Ejderhasoy)
};

/** Icon path of every spec id (the whole SpecId union; the legacy mage specs keep the mage icon). */
export const SPEC_ICON: Record<SpecId, string> = {
  knight_protector: CLASS_ICON_PATH.knight,
  knight_blademaster: CLASS_ICON_PATH.knight,
  barbarian_warlord: CLASS_ICON_PATH.barbarian,
  barbarian_butcher: CLASS_ICON_PATH.barbarian,
  mage_elementalist: CLASS_ICON_PATH.mage,
  mage_lightbringer: CLASS_ICON_PATH.mage,
  mage_fire: CLASS_ICON_PATH.mage,
  mage_frost: CLASS_ICON_PATH.mage,
  mage_arcane: CLASS_ICON_PATH.mage,
  rogue_assassin: CLASS_ICON_PATH.rogue,
  rogue_alchemist: CLASS_ICON_PATH.rogue,
  monk_brewmaster: CLASS_ICON_PATH.monk,
  monk_windwalker: CLASS_ICON_PATH.monk,
  monk_mistweaver: CLASS_ICON_PATH.monk,
  archer_marksman: CLASS_ICON_PATH.archer,
  archer_beastmaster: CLASS_ICON_PATH.archer,
  archer_survival: CLASS_ICON_PATH.archer,
  paladin_protection: CLASS_ICON_PATH.paladin,
  paladin_holy: CLASS_ICON_PATH.paladin,
  paladin_retribution: CLASS_ICON_PATH.paladin,
  necromancer_summoner: CLASS_ICON_PATH.necromancer,
  necromancer_bone: CLASS_ICON_PATH.necromancer,
  warlock_affliction: CLASS_ICON_PATH.warlock,
  warlock_destruction: CLASS_ICON_PATH.warlock,
  // CM1 stubs: the six new spec ids fall back to their class icon (the SPEC_ICON contract: every SpecId has a path)
  // AE-3 / AE-4: own spec icons for the new classes
  demonhunter_chaos: '/assets/icons/skill-blade-storm.svg',
  demonhunter_vengeance: '/assets/icons/skill-iron-skin.svg',
  demonhunter_devourer: '/assets/icons/skill-life-drain.svg',
  evoker_devastation: CLASS_ICON_PATH.evoker,
  evoker_preservation: '/assets/icons/skill-regeneration.svg',
  evoker_augmentation: '/assets/icons/buff-haste.svg',
  rogue_subtlety: CLASS_ICON_PATH.rogue,
};

/** Role tint of a spec icon (GDD_TALENTS §5.7): tank blue, healer green, DPS red. */
export const SPEC_ROLE_TINT: Record<RoleId, string> = {
  tank: '#5aa8ff',
  healer: '#6fdc8c',
  dps: '#e0604e',
};

/** Icon path for a spec id, or '' for an unknown id. Never throws. */
export function specIcon(spec: string | null | undefined): string {
  if (!spec || !Object.prototype.hasOwnProperty.call(SPEC_ICON, spec)) return '';
  return SPEC_ICON[spec as SpecId];
}
