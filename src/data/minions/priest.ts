/**
 * PRIEST minions (Rahip kit, Gölge Canavarı major, priest_shadow_fiend). One pet, group `pet` (cap 1), 15 s. Registered by the
 * aggregator in data/minions.ts. OWNER: priest kit.
 *
 * The model is the Mage body (the priest's class model, public/assets/models/characters/Mage.glb). Its clip names are the ones
 * the mage and the monk rows already use. The Shadowfiend's own mana-return and its Tutulma are not modelled (pick: a bite and a
 * shadow bolt only).
 */
import type { MinionDef } from '../../types/minions';

const MAGE = '/assets/models/characters/Mage.glb';

export const PRIEST_MINIONS: MinionDef[] = [
  {
    // Gölge Canavarı (priest_shadow_fiend, m90): a shadow pet that bites and hurls a shadow bolt, 15 s
    id: 'priest_shadowfiend', name: 'Gölge Canavarı (Shadowfiend)', ownerClass: 'priest', role: 'caster', group: 'pet',
    model: MAGE, scale: 0.9, tint: 0x3a1f5c, emissive: 0x2a0a4a, ghost: 0.7,
    anims: { idle: 'Idle', walk: 'Walking_A', run: 'Running_A', hit: 'Hit_A', death: 'Death_A', spawn: 'Spellcast_Raise' },
    radius: 0.6, height: 1.8, speed: 6.0,
    hpFrac: 0.5, armorFrac: 0.1,
    attacks: [
      { id: 'priest_shadowfiend_bite', name: 'Gölge Isırığı', kind: 'melee', range: 2.4, cooldown: 1.5, hitTime: 0.4, anim: 'Unarmed_Melee_Attack_Punch_A', animSpeed: 1.2, coef: 1.1, type: 'shadow' },
      { id: 'priest_shadowfiend_bolt', name: 'Gölge Okı', kind: 'projectile', range: 14, cooldown: 2.5, hitTime: 0.5, anim: 'Spellcast_Shoot', animSpeed: 1.0, coef: 1.6, type: 'shadow' },
    ],
    aggro: 12, follow: [2, 4], leash: 25,
    life: 15,
  },
];
