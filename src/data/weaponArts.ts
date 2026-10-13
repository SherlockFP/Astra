/**
 * Weapon arts (Silah Sanatları, GDD_V2 §3.8): the tier-2 charged release of the equipped weapon category.
 * Every art carries Kes (interrupt); `kickLockout` is the personal kick lockout after it (shown on the kick tracker).
 * Numbers: `coef` x weapon damage, `poise` poise damage, `chargeSec` hold for tier 2 (GDD). OWNER: combat (data).
 * Types: types/v2.ts. Visuals: `weapon_art_<id>` VFX ids (vfx-audio, unknown ids stay silent).
 */
import type { WeaponArtDef } from '../types/v2';
import type { ItemCategory } from '../types/items';

const ART = (d: WeaponArtDef): WeaponArtDef => d;

export const WEAPON_ARTS: Readonly<Record<string, WeaponArtDef>> = {
  wa_rising_blade: ART({ id: 'wa_rising_blade', name: 'Yükselen Kılıç', category: 'sword1h', chargeSec: 0.75, coef: 3.4, poise: 50, kick: true, kickLockout: 10, params: { dash: 3.5, knockup: 0.8, arc: 100, range: 3.4 } }),
  wa_earthbreaker: ART({ id: 'wa_earthbreaker', name: 'Yer Kıran', category: 'axe2h', chargeSec: 0.75, coef: 4.2, poise: 70, kick: true, kickLockout: 10, params: { arc: 120, range: 4.2, shockRadius: 3.0, shockCoef: 1.2 } }),
  wa_crushing_blow: ART({ id: 'wa_crushing_blow', name: 'Ezici Darbe', category: 'mace', chargeSec: 0.85, coef: 3.6, poise: 90, kick: true, kickLockout: 10, params: { poiseMul: 2 } }),
  wa_starfall_beam: ART({ id: 'wa_starfall_beam', name: 'Yıldız Işını', category: 'staff', chargeSec: 0.75, coef: 3.2, poise: 30, kick: true, kickLockout: 12, params: { range: 22, width: 1.2, beamSec: 0.4 } }),
  wa_twin_bolts: ART({ id: 'wa_twin_bolts', name: 'İkiz Şimşek', category: 'wand', chargeSec: 0.6, coef: 1.5, poise: 20, kick: true, kickLockout: 12, params: { bolts: 2, range: 20 } }),
  wa_flurry: ART({ id: 'wa_flurry', name: 'Hançer Fırtınası', category: 'dagger', chargeSec: 0.75, coef: 0.7, poise: 36, kick: true, kickLockout: 8, params: { strikes: 6, duration: 0.6, behindStep: 2 } }),
  wa_piercing_bolt: ART({ id: 'wa_piercing_bolt', name: 'Delici Ok', category: 'crossbow', chargeSec: 1.0, coef: 3.0, poise: 40, kick: true, kickLockout: 10, params: { range: 30 } }),
  wa_dawn_wave: ART({ id: 'wa_dawn_wave', name: 'Şafak Dalgası', category: 'staff', chargeSec: 0.75, coef: 1.6, poise: 20, kick: true, kickLockout: 12, params: { cone: 8, allyHeal: 1.4 } }),
  wa_twin_vials: ART({ id: 'wa_twin_vials', name: 'Çift Şişe', category: 'dagger', chargeSec: 0.75, coef: 2.0, poise: 20, kick: true, kickLockout: 10, params: { vials: 2 } }),
};

/** Weapon art by id; undefined while the id is unknown. */
export function getWeaponArt(id: string | null | undefined): WeaponArtDef | undefined {
  return id ? WEAPON_ARTS[id] : undefined;
}

/**
 * The art of each equipped weapon category (GDD_V2 §3.8 table). The class heavy's art is the fallback when the category has no
 * art (e.g. an axe1h knight). Healer overrides (`SpecDef.weaponArt`) come from the spec layer.
 */
export const ART_BY_CATEGORY: Partial<Record<ItemCategory, string>> = {
  sword1h: 'wa_rising_blade',
  axe2h: 'wa_earthbreaker',
  mace: 'wa_crushing_blow',
  staff: 'wa_starfall_beam',
  wand: 'wa_twin_bolts',
  dagger: 'wa_flurry',
  crossbow: 'wa_piercing_bolt',
  bow: 'wa_piercing_bolt',
};
