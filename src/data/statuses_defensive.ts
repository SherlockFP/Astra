/**
 * Midnight defensive / utility StatusDefs and STATUS_RULES (Işık Mekanı, Koruma Duası, Büyü Yansıtma, Tehdit Saptırma and the
 * absorb labels Yaşam Kozası, Göksel Karışım, Toprak Duvarı). Merged into STATUSES / STATUS_RULES by data/statuses.ts.
 *
 * Behaviour lives in code, not here:
 *  - beacon_of_light: healing.ts healAmount copies a share (statuses magnitude) of each heal the caster gives an ally to the holder.
 *  - blessing_protection, spell_reflection: Combat.hitLocalPlayer (physical hits do nothing / magic hits are sent back).
 *  - misdirection: EnemyAI.onDamaged books the caster's threat on the status's sourceId (the redirect target).
 *  - the absorb labels: addAbsorb (healing.ts) puts the shield on the `shield` status; the label only carries the absorbed amount.
 */
import type { StatusDef, StatusId } from '../types/skills';
import type { StatusRule } from './statuses';

const I = (n: string) => `/assets/icons/${n}.svg`;

export const STATUSES_DEFENSIVE: Partial<Record<StatusId, StatusDef>> = {
  // Işık Mekanı (Beacon of Light): on one ally; magnitude = the share of the caster's heals on other allies copied to it
  beacon_of_light: { id: 'beacon_of_light', name: 'Işık Mekanı', icon: I('buff-aura'), kind: 'buff', vfx: 'heal_loop' },
  // Koruma Duası (Blessing of Protection): physical hits do nothing while it lasts
  blessing_protection: { id: 'blessing_protection', name: 'Koruma Duası', icon: I('buff-blessing'), kind: 'buff', vfx: 'buff_aura' },
  // Büyü Yansıtma (Spell Reflection): magic hits are sent back to their source while it lasts
  spell_reflection: { id: 'spell_reflection', name: 'Büyü Yansıtma', icon: I('buff-reflect'), kind: 'buff', vfx: 'buff_aura' },
  // Tehdit Saptırma (Misdirection): the caster's threat is booked on the sourceId ally (the tank) while it lasts
  misdirection: { id: 'misdirection', name: 'Tehdit Saptırma', icon: I('buff-aura'), kind: 'buff' },
  // absorb labels (HUD only)
  life_cocoon: { id: 'life_cocoon', name: 'Yaşam Kozası', icon: I('buff-absorb'), kind: 'buff' },
  celestial_brew: { id: 'celestial_brew', name: 'Göksel Karışım', icon: I('buff-absorb'), kind: 'buff' },
  earthen_wall: { id: 'earthen_wall', name: 'Toprak Duvarı', icon: I('buff-absorb'), kind: 'buff' },
};

export const STATUS_RULES_DEFENSIVE: Partial<Record<StatusId, StatusRule>> = {
  beacon_of_light: { stack: 'refresh' },
  blessing_protection: { stack: 'refresh' },
  spell_reflection: { stack: 'refresh' },
  misdirection: { stack: 'refresh' },
};
