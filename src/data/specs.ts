/**
 * Spec registry (GDD_V2 §1.3). OWNER: combat (data, WP5).
 *
 * Six V2 specs of the non-mage classes (knight, barbarian, rogue). The mage specs are superseded by GDD_TALENTS
 * (mage_fire / mage_frost / mage_arcane) and live in data/specs_talents.ts (merged below, owner T8).
 * Passive `stats` are folded once by StatCalc.computeStats (with the solo-role rule, CORE_MECHANICS §1.5).
 * Skill rows of the specs live in data/skills.ts (`spec` field). Majors are in SkillDef.defaultSlot m45/m90/m180.
 *
 * `mods` only lists changes the runtime applies: `patch` (cooldown, cost, statuses) and `params.threat` / `params.threatMult`
 * (the GDD §1.4 threat formula reads them). Everything else in the design text is still open (see the WP5 report).
 */
import type { RoleId, SpecDef, SpecId } from '../types/v2';
import type { StatBlock } from '../types/stats';
import type { ClassId } from '../types/common';
import { TALENT_SPECS } from './specs_talents';
// KIT PK-0 (docs/kits/casters-rogue.md §h): empty kit spec tables until the class packages fill them.
import { SPECS_KIT_MAGE } from './specs_kit_mage';
import { SPECS_KIT_ROGUE } from './specs_kit_rogue';
import { SPECS_KIT_WARLOCK } from './specs_kit_warlock';
// WP-02 (Keşiş / Okçu): the two kit spec tables (filled by the monk and archer packages).
import { SPECS_KIT_MONK } from './specs_kit_monk';
import { SPECS_KIT_ARCHER } from './specs_kit_archer';
import { SPECS_KIT_PRIEST } from './specs_kit_priest';
import { SPECS_KIT_SHAMAN } from './specs_kit_shaman';
import { SPECS_KIT_DRUID } from './specs_kit_druid';
// AE-3 / AE-4 (docs/kits/agile-evoker.md): İblis Avcısı (Kaos, İntikam, Yutucu) and Ejderhasoy (Yıkım Nefesi, Koruyucu Nefes, Yüceltme)
import { SPECS_KIT_DEMONHUNTER } from './specs_kit_demonhunter';
import { SPECS_KIT_EVOKER } from './specs_kit_evoker';
import { KNIGHT_SPECS } from './specs_kit_knight';
import { BARBARIAN_SPECS } from './specs_barbarian';
import { PALADIN_SPECS } from './specs_paladin';
import { NECRO_SPECS } from './specs_necromancer';

const SPEC_LIST: SpecDef[] = [
];

/** Non-mage spec registry plus the GDD_TALENTS mage specs (merged in; T8 fills TALENT_SPECS). */
export const SPECS: Partial<Record<SpecId, SpecDef>> = {};
Object.assign(SPECS, KNIGHT_SPECS, BARBARIAN_SPECS, PALADIN_SPECS, NECRO_SPECS);
for (const s of SPEC_LIST) SPECS[s.id] = s;
Object.assign(SPECS, TALENT_SPECS);
Object.assign(SPECS, SPECS_KIT_MAGE, SPECS_KIT_ROGUE, SPECS_KIT_WARLOCK, SPECS_KIT_MONK, SPECS_KIT_ARCHER, SPECS_KIT_PRIEST, SPECS_KIT_SHAMAN, SPECS_KIT_DRUID, SPECS_KIT_DEMONHUNTER, SPECS_KIT_EVOKER);

/** Spec definition by id; undefined while the registry is empty or the id is unknown. */
export function getSpec(id: SpecId | null | undefined): SpecDef | undefined {
  return id ? SPECS[id] : undefined;
}

/** Spec ids of a class in registry order (knight: protector, blademaster). */
export function specsForClass(classId: ClassId): SpecId[] {
  return (Object.values(SPECS) as SpecDef[]).filter((s) => s.classId === classId).map((s) => s.id);
}

/** Passive stat block of a spec (empty for an unknown id). Folded additively by Player.refreshStats. */
export function specStatBlock(id: SpecId | null | undefined): StatBlock {
  return getSpec(id)?.stats ?? {};
}

/**
 * CORE_MECHANICS §2 (CM1): role overrides for specs whose SpecDef is not registered yet (Kemik Ustası has no row, so its role
 * lives here). `necromancer_bone` = tank (Blood Death Knight style). The six new CM1 spec ids follow the §2 table
 * (coverage: 6 tanks, 4 healers, 16 DPS + 1 support). Once a SpecDef exists its own `role` wins.
 */
export const SPEC_ROLE_OVERRIDES: Partial<Record<SpecId, RoleId>> = {
  necromancer_bone: 'tank',
  demonhunter_chaos: 'dps',
  demonhunter_vengeance: 'tank',
  evoker_devastation: 'dps',
  evoker_preservation: 'healer',
  evoker_augmentation: 'dps',
  rogue_subtlety: 'dps',
  // CLASS SCAFFOLD: roles of the ten new spec ids (SpecDef rows arrive with the kits; the role wins once a row exists)
  priest_discipline: 'healer', priest_holy: 'healer', priest_shadow: 'dps',
  shaman_elemental: 'dps', shaman_enhancement: 'dps', shaman_restoration: 'healer',
  druid_balance: 'dps', druid_feral: 'dps', druid_guardian: 'tank', druid_restoration: 'healer',
  demonhunter_devourer: 'dps',
};

/**
 * CORE_MECHANICS §2 (CM1): Turkish names of the six new spec ids (compile-only stubs; no SpecDef rows until the CM10 / CM12 kits).
 * Not read by the runtime yet.
 */
export const NEW_SPEC_NAMES_TR: Partial<Record<SpecId, { classId: ClassId; name: string }>> = {
  demonhunter_chaos: { classId: 'demonhunter', name: 'Kaos' },
  demonhunter_vengeance: { classId: 'demonhunter', name: 'İntikam' },
  evoker_devastation: { classId: 'evoker', name: 'Yıkım Nefesi' },
  evoker_preservation: { classId: 'evoker', name: 'Koruyucu Nefes' },
  evoker_augmentation: { classId: 'evoker', name: 'Yüceltme' },
  rogue_subtlety: { classId: 'rogue', name: 'Gölge' },
  // CLASS SCAFFOLD (Turkish spec names of the Rahip / Şaman / Druid trios)
  priest_discipline: { classId: 'priest', name: 'Disiplin' }, priest_holy: { classId: 'priest', name: 'Kutsal' }, priest_shadow: { classId: 'priest', name: 'Gölge' },
  shaman_elemental: { classId: 'shaman', name: 'Elementel' }, shaman_enhancement: { classId: 'shaman', name: 'Geliştirme' }, shaman_restoration: { classId: 'shaman', name: 'Restorasyon' },
  druid_balance: { classId: 'druid', name: 'Denge' }, druid_feral: { classId: 'druid', name: 'Vahşi' }, druid_guardian: { classId: 'druid', name: 'Koruyucu' }, druid_restoration: { classId: 'druid', name: 'Restorasyon' },
  demonhunter_devourer: { classId: 'demonhunter', name: 'Yutucu' },
};

/** Role of a spec: its SpecDef.role when registered, else SPEC_ROLE_OVERRIDES (undefined for unknown ids). */
export function specRole(id: SpecId | null | undefined): RoleId | undefined {
  if (!id) return undefined;
  return getSpec(id)?.role ?? SPEC_ROLE_OVERRIDES[id];
}
