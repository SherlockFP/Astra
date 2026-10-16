/**
 * Şişe bases (flasks, GDD_V2 §4.2). Base ids `flask_*`; affixes `fl_pre_*` / `fl_suf_*`. OWNER: items (data). Types: types/v2.ts.
 * The first flask is the Sisli Matara: a refillable starter flask every character gets at level 1 (see ensureStarterFlask).
 */
import type { FlaskBaseDef } from '../types/v2';
import type { CharacterSave } from '../types/character';
import type { ItemInstance } from '../types/items';

/** Şişe Kemeri slots: flask1..flask5 (keys 6 7 8 9 0). */
export const FLASK_SLOT_COUNT = 5;

export const SISLI_MATARA_ID = 'flask_sisli_matara';
/** Sisli Matara: 3 charges, heals 35 % max HP over 3 s, 20 s cooldown, refilled in a village or town (or at a campfire). */
export const SISLI_MATARA_CHARGES = 3;
export const SISLI_MATARA_HEAL_PCT = 0.35;
export const SISLI_MATARA_HEAL_SEC = 3;
export const SISLI_MATARA_COOLDOWN_S = 20;

/**
 * Upgrade hook (data only, no quest or vendor grants it yet): the save flag `flask.matara.upgrade` adds `extraCharges`.
 * Whoever grants the upgrade sets that flag and refills the flask.
 */
export const SISLI_MATARA_UPGRADE = { flag: 'flask.matara.upgrade', extraCharges: 1 } as const;

export const FLASK_BASES: Readonly<Record<string, FlaskBaseDef>> = {
  [SISLI_MATARA_ID]: {
    id: SISLI_MATARA_ID,
    name: 'Sisli Matara',
    minIlvl: 1,
    max: [SISLI_MATARA_CHARGES, SISLI_MATARA_CHARGES, SISLI_MATARA_CHARGES, SISLI_MATARA_CHARGES],
    use: 1,
    effect: { heal: SISLI_MATARA_HEAL_PCT },
    dur: [SISLI_MATARA_HEAL_SEC, SISLI_MATARA_HEAL_SEC, SISLI_MATARA_HEAL_SEC, SISLI_MATARA_HEAL_SEC],
    icon: '/assets/icons/item-potion-flask.svg',
    cd: SISLI_MATARA_COOLDOWN_S,
  },
};

/** Flask base by id; undefined while the id is unknown. */
export function getFlaskBase(id: string): FlaskBaseDef | undefined {
  return FLASK_BASES[id];
}

/** True for a flask base id (the bar cell and the belt both use it). */
export const isFlaskBase = (id: string): boolean => getFlaskBase(id) !== undefined;

/** Charge cap of a flask: the base's cap, plus the upgrade's extra charges when the character holds the upgrade. */
export function flaskMaxCharges(baseId: string, upgraded: boolean): number {
  const base = getFlaskBase(baseId);
  if (!base) return 0;
  const extra = baseId === SISLI_MATARA_ID && upgraded ? SISLI_MATARA_UPGRADE.extraCharges : 0;
  return base.max[0] + extra;
}

/** True when the character holds the Sisli Matara upgrade (save flag). */
export const hasFlaskUpgrade = (save: CharacterSave): boolean => !!save.flags?.[SISLI_MATARA_UPGRADE.flag];

/**
 * Gives a character its Sisli Matara once (idempotent: the flag keeps a flask the player moved or dropped from coming back).
 * Writes the first empty belt slot, full of charges.
 */
export function ensureStarterFlask(save: CharacterSave): void {
  const flags = (save.flags ??= {});
  if (flags['flask.matara.granted']) return;
  flags['flask.matara.granted'] = 1;
  save.flasks ??= [null, null, null, null, null];
  save.flaskCharges ??= [0, 0, 0, 0, 0];
  const slot = save.flasks.findIndex((f) => !f);
  if (slot < 0) return;
  const item: ItemInstance = { uid: `flask_matara_${save.id}`, baseId: SISLI_MATARA_ID, rarity: 'common', itemLevel: 1, affixes: [] };
  save.flasks[slot] = item;
  save.flaskCharges[slot] = flaskMaxCharges(SISLI_MATARA_ID, hasFlaskUpgrade(save));
}
