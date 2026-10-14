/**
 * MONK minions (GDD_CLASSES_V2 §2.6, NC23). Ruh kopyaları (Ateş / Toprak, Fırtına, Toprak ve Ateş major, group `clone` cap 2)
 * and the Kara Öküz (Demci major, group `guardian` cap 1). Registered by the aggregator in data/minions.ts.
 *
 * Clip names are checked against public/assets/models/characters/Barbarian.glb and itch/creatures/rhino.glb. Barbarian has no
 * `Spawn_Air` clip, so the clone spawn uses `Spellcast_Raise` (GDD §2.6 said Spawn_Air). Hit / spawn timings are the GDD's.
 */
import type { MinionDef } from '../../types/minions';

const BARBARIAN = '/assets/models/characters/Barbarian.glb';
const RHINO = '/assets/models/itch/creatures/rhino.glb';
// the Barbarian's own helmet, cape, shield and axes stay hidden on every clone (GDD §2.2)
const CLONE_HIDE = ['2H_Axe', '1H_Axe', '1H_Axe_Offhand', 'Barbarian_Round_Shield', 'Barbarian_Hat', 'Barbarian_Cape'];
const CLONE_ANIMS = { idle: 'Unarmed_Idle', walk: 'Walking_A', run: 'Running_A', hit: 'Hit_A', death: 'Death_A', spawn: 'Spellcast_Raise' };

export const MONK_MINIONS: MinionDef[] = [
  {
    // Ateş Kopyası (Storm, Earth and Fire, m90): fire-tinted clone, 15 s, copies the owner's target
    id: 'monk_clone_fire', name: 'Ateş Kopyası', ownerClass: 'monk', role: 'clone', group: 'clone',
    model: BARBARIAN, scale: 1.0, tint: 0xff7a30, emissive: 0x802000, ghost: 0.78, hide: CLONE_HIDE,
    anims: CLONE_ANIMS, radius: 0.5, height: 1.9, speed: 7.5,
    hpFrac: 0.4, armorFrac: 0.2,
    attacks: [
      { id: 'monk_clone_fire_jab', name: 'Ateş Yumruğu', kind: 'melee', range: 2.4, cooldown: 0.7, hitTime: 0.44, anim: 'Unarmed_Melee_Attack_Punch_A', animSpeed: 1.6, coef: 0.9, type: 'fire' },
      { id: 'monk_clone_fire_kick', name: 'Ateş Tekmesi', kind: 'melee', range: 3, cooldown: 3.0, hitTime: 0.36, anim: 'Unarmed_Melee_Attack_Kick', animSpeed: 1.4, coef: 1.4, type: 'fire', knockback: 1 },
    ],
    aggro: 12, follow: [2, 4], leash: 25,
    life: 15,
  },
  {
    // Toprak Kopyası: earth-tinted clone, slower, hits harder with the stab AoE, 15 s
    id: 'monk_clone_earth', name: 'Toprak Kopyası', ownerClass: 'monk', role: 'clone', group: 'clone',
    model: BARBARIAN, scale: 1.0, tint: 0xc8a050, emissive: 0x403010, ghost: 0.78, hide: CLONE_HIDE,
    anims: CLONE_ANIMS, radius: 0.5, height: 1.9, speed: 6.8,
    hpFrac: 0.5, armorFrac: 0.35,
    attacks: [
      { id: 'monk_clone_earth_jab', name: 'Toprak Yumruğu', kind: 'melee', range: 2.4, cooldown: 0.8, hitTime: 0.44, anim: 'Unarmed_Melee_Attack_Punch_A', animSpeed: 1.6, coef: 0.9, type: 'physical' },
      { id: 'monk_clone_earth_kick', name: 'Toprak Tekmesi', kind: 'melee', range: 3, cooldown: 3.0, hitTime: 0.36, anim: 'Unarmed_Melee_Attack_Kick', animSpeed: 1.4, coef: 1.4, type: 'physical', knockback: 1 },
      { id: 'monk_clone_earth_stab', name: 'Toprak Hançeri', kind: 'aoe', range: 3, radius: 1.8, cooldown: 4, hitTime: 0.512, anim: 'Dualwield_Melee_Attack_Stab', animSpeed: 1.3, coef: 1.8, type: 'physical', stagger: 12 },
    ],
    aggro: 12, follow: [2, 4], leash: 25,
    life: 15,
  },
  {
    // Kara Öküz (Demci m90, Kara Öküz Ruhu): guardian, cap 1, 25 s. Stamp's Sarsma reduction (-8 % pool per hit) is a param
    // only: the pool hook is not in the engine yet (see the monk report).
    id: 'monk_black_ox', name: 'Kara Öküz', ownerClass: 'monk', role: 'guardian', group: 'guardian',
    model: RHINO, scale: 0.8, tint: 0x2c2c3c, emissive: 0x2a6a50,
    anims: { idle: 'Idle', walk: 'Walk', run: 'Run', hit: 'Hit', death: 'Death', spawn: 'Wake' },
    radius: 1.2, height: 2.0, speed: 5.4,
    hpFrac: 1.0, armorFrac: 0.45,
    attacks: [
      { id: 'monk_black_ox_gore', name: 'Boynuzlama', kind: 'melee', range: 3, arc: 90, cooldown: 2.2, hitTime: 0.45, anim: 'Gore', animSpeed: 1.0, coef: 1.6, type: 'physical', knockback: 1.5 },
      { id: 'monk_black_ox_stamp', name: 'Ayak Vurma', kind: 'aoe', range: 4, radius: 4, cooldown: 4, hitTime: 1.0, anim: 'Stamp', animSpeed: 1.0, coef: 2.2, type: 'physical', stagger: 20, params: { poolReduce: 0.08 } },
      { id: 'monk_black_ox_roar', name: 'Kükreme', kind: 'taunt', range: 8, radius: 8, cooldown: 6, hitTime: 0.3, anim: 'Roar', animSpeed: 1.0, coef: 0, type: 'physical', params: { tauntSec: 3 } },
    ],
    aggro: 12, follow: [3, 6], leash: 30,
    life: 25,
  },
];
