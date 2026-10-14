/**
 * English names for skills whose Turkish `SkillDef.name` carries no "(English)" part (the tooltip shows "Türkçe (English)").
 * Only the skills a new character meets in the first levels are listed; a skill not in this table shows its Turkish name alone.
 * Read by widgets/tooltips.ts (skillTooltipHTML). Add rows here, never change the skill files.
 */
export const SKILL_NAMES_EN: Readonly<Record<string, string>> = {
  knight_templar_verdict: 'Verdict Strike',
  knight_zeal: 'Zeal',
  necro_basic: 'Bone Shards',
  necro_basic_1: 'Bone Splinter',
  necro_basic_2: 'Bone Splinter',
  necro_basic_3: 'Soul Lance',
  necro_basic_4: 'Bone Burst',
  necro_blood_basic: 'Bone Scythe Combo',
  necro_blood_basic_1: 'Bone Scythe Combo',
  necro_blood_basic_2: 'Bone Scythe Combo',
  necro_blood_basic_3: 'Bone Scythe Combo',
  necro_blood_basic_4: 'Bone Scythe Combo',
  warlock_basic: 'Shadow Bolt Chain',
  warlock_basic_1: 'Shadow Bolt Chain',
  warlock_basic_2: 'Shadow Bolt Chain',
  warlock_basic_3: 'Shadow Bolt Chain',
  warlock_basic_4: 'Shadow Bolt Chain',
  evoker_basic_1: 'Azure Claw',
  evoker_basic_2: 'Azure Claw',
  evoker_basic_3: 'Azure Sweep',
  paladin_rebuke: 'Rebuke',
};

/** "Türkçe (English)" when the English part is known and missing from the name, else the name unchanged. */
export function skillDisplayName(id: string, name: string): string {
  if (/\(.+\)/.test(name)) return name;
  const en = SKILL_NAMES_EN[id];
  return en ? `${name} (${en})` : name;
}
