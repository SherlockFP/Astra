/**
 * ARCHER minions (GDD_CLASSES_V2 §3.6 / §1.5). archer_wolf is the Yoldaş (call_pet, group `pet` cap 1, free respawn 10 s after death);
 * archer_wolf_ally are the Av Sürüsü pack (group `pack` cap 2, life 20 s). archer_bear (Av Ustası L20 pet choice) and archer_hawk (wave 3)
 * are not built yet. Registered by the aggregator in data/minions.ts. OWNER: archer package.
 */
import type { MinionDef } from '../../types/minions';

const WOLF_MODEL = '/assets/models/itch/creatures/wolf.glb';

export const ARCHER_MINIONS: MinionDef[] = [
  {
    // the pet: bite every 1.1 s (r 2.0, arc 100), lunge every 6 s (leap r 6, 1.8 physical, bleed 4 s at 0.4, stagger 12)
    id: 'archer_wolf', name: 'Kurt Yoldaş', ownerClass: 'archer', role: 'beast', group: 'pet',
    model: WOLF_MODEL, scale: 1.0,
    anims: { idle: 'Idle', walk: 'Walk', run: 'Run', hit: 'Hit', death: 'Death', spawn: 'GetUp' },
    radius: 0.5, height: 1.2, speed: 7.0,
    hpFrac: 0.45, armorFrac: 0.25,
    attacks: [
      { id: 'archer_wolf_bite', name: 'Isırık', kind: 'melee', range: 2.0, arc: 100, cooldown: 1.1, hitTime: 0.47, anim: 'Bite', animSpeed: 1.5, coef: 0.9, type: 'physical' },
      {
        id: 'archer_wolf_lunge', name: 'Atılma', kind: 'leap', range: 6, cooldown: 6, hitTime: 0.87, anim: 'Lunge', animSpeed: 1.0,
        coef: 1.8, type: 'physical', stagger: 12, statuses: [{ status: 'bleed', duration: 4, magnitude: 0.4 }],
      },
    ],
    aggro: 14, follow: [2.5, 5], leash: 30,
    respawn: { dead: 10 },
  },
  {
    // Av Sürüsü (m90): two timed wolves that attack the owner's target. Lighter than the pet (25 % HP, bite coef 0.7, lunge 1.2)
    id: 'archer_wolf_ally', name: 'Sürü Kurdu', ownerClass: 'archer', role: 'beast', group: 'pack',
    model: WOLF_MODEL, scale: 0.95, tint: 0xf4f4ff,   // the wolf_white texture is approximated by a tint (MinionDef has no texture variant)
    anims: { idle: 'Idle', walk: 'Walk', run: 'Run', hit: 'Hit', death: 'Death', spawn: 'GetUp' },
    radius: 0.5, height: 1.2, speed: 7.0,
    hpFrac: 0.25, armorFrac: 0.15,
    attacks: [
      { id: 'archer_wolf_ally_bite', name: 'Isırık', kind: 'melee', range: 2.0, arc: 100, cooldown: 1.0, hitTime: 0.47, anim: 'Bite', animSpeed: 1.5, coef: 0.7, type: 'physical' },
      {
        id: 'archer_wolf_ally_lunge', name: 'Atılma', kind: 'leap', range: 6, cooldown: 7, hitTime: 0.87, anim: 'Lunge', animSpeed: 1.0,
        coef: 1.2, type: 'physical',
      },
    ],
    aggro: 14, follow: [2.5, 5], leash: 30,
    life: 20,
  },
];
