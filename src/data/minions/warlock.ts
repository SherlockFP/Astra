/**
 * WARLOCK minions (WoW Midnight Demonology, docs/WOW_ABILITY_MAP.md §8.2). Summoned by the minion_summon behaviour rows of
 * the Demonology skills (skillsets/warlockDemonology.ts): Vahşi Cin (Hand of Gul'dan, timed 20 s, group imp), Dreadstalker
 * (Call Dreadstalkers, timed 12 s, group demon), Felguard (Summon Felguard, permanent pet, group pet, free respawn 10 s after
 * death / 2 s after a scene change) and Demonik Tiran (Summon Demonic Tyrant, timed 15 s, group guardian).
 * Models are the monsters set (`monsters/`); anims are the enemyKit sets (A_FLY for the flying imp, A_ENEMY / A_CHAR otherwise).
 * Implosion (warlockKit.ts) despawns every Vahşi Cin. Registered by data/minions.ts.
 */
import type { MinionDef } from '../../types/minions';

const MON = (n: string) => `/assets/models/monsters/${n}.glb`;
const A_FLY = { idle: 'Flying_Idle', walk: 'Flying_Idle', run: 'Fast_Flying', hit: 'HitReact', death: 'Death' };
const A_ENEMY = { idle: 'Idle', walk: 'Walk', run: 'Run', hit: 'HitRecieve', death: 'Death' };
const A_CHAR = { idle: 'Idle', walk: 'Walk', run: 'Run', hit: 'HitReact', death: 'Death' };
const TAUNT_ANIM = 'Taunt';

export const WARLOCK_MINIONS: MinionDef[] = [
  {
    // Hand of Gul'dan: 3 per cast, timed 20 s, cap group imp (uncapped beyond the three cast)
    id: 'warlock_wild_imp', name: 'Vahşi Cin', ownerClass: 'warlock', role: 'ranged', group: 'imp',
    model: MON('Imp'), scale: 0.7, tint: 0xff7a30,
    anims: A_FLY, radius: 0.45, height: 1.2, speed: 6.5, hover: 0.8,
    hpFrac: 0.12, armorFrac: 0.0,
    attacks: [
      // firebolt every 1.6 s, 0.35 fire, range 18 (kite-style caster)
      { id: 'warlock_wild_imp_bolt', name: 'Ateş Kıvılcımı', kind: 'projectile', range: 18, cooldown: 1.6, hitTime: 0.5, anim: 'Punch', animSpeed: 1.2, coef: 0.35, type: 'fire', speed: 20, vfx: { projectile: 'fire_projectile', impact: 'fire_burst' } },
    ],
    aggro: 12, follow: [3, 6], leash: 30,
    life: 20,
  },
  {
    // Call Dreadstalkers: 2 per cast, timed 12 s, group demon
    id: 'warlock_dreadstalker', name: 'Dreadstalker', ownerClass: 'warlock', role: 'melee', group: 'demon',
    model: MON('Demon'), scale: 1.0, tint: 0x4a2a6a,
    anims: A_ENEMY, radius: 0.6, height: 2.0, speed: 6.4,
    hpFrac: 0.35, armorFrac: 0.2,
    attacks: [
      { id: 'warlock_dreadstalker_claw', name: 'Pençe', kind: 'melee', range: 2.6, cooldown: 1.5, hitTime: 0.4, anim: 'Punch', animSpeed: 1.3, coef: 0.5, type: 'shadow' },
    ],
    aggro: 11, follow: [2, 4.5], leash: 30,
    life: 12,
  },
  {
    // Summon Felguard: permanent pet, group pet (cap 1), free respawn
    id: 'warlock_felguard', name: 'Felguard', ownerClass: 'warlock', role: 'tank', group: 'pet',
    model: MON('Demon_Lord'), scale: 0.75, tint: 0x3f9a4a,
    anims: A_CHAR, radius: 0.7, height: 2.4, speed: 5.6,
    hpFrac: 0.7, armorFrac: 0.35,
    attacks: [
      { id: 'warlock_felguard_cleave', name: 'Yarma', kind: 'melee', range: 2.8, cooldown: 2.0, hitTime: 0.5, anim: 'Punch', animSpeed: 1.1, coef: 0.9, type: 'physical' },
      // Kışkırtma: pulls the enemies busy with someone else for 3 s (bosses 2 s); coef 0, no damage
      { id: 'warlock_felguard_taunt', name: 'Kışkırtma', kind: 'taunt', range: 7, radius: 7, cooldown: 10, hitTime: 0.3, anim: TAUNT_ANIM, animSpeed: 1.2, coef: 0, type: 'shadow', params: { tauntSec: 3, minTargets: 2 } },
    ],
    aggro: 10, follow: [2, 4.5], leash: 28,
    respawn: { dead: 10, scene: 2 },
  },
  {
    // Summon Demonic Tyrant: one per cast, timed 15 s, group guardian; the empower status is on the caster (kit statuses)
    id: 'warlock_demonic_tyrant', name: 'Demonik Tiran', ownerClass: 'warlock', role: 'guardian', group: 'guardian',
    model: MON('Demon_Lord'), scale: 1.25, tint: 0x702080, emissive: 0x3a0a4a,
    anims: A_CHAR, radius: 0.9, height: 3.0, speed: 6.0,
    hpFrac: 1.2, armorFrac: 0.3,
    attacks: [
      { id: 'warlock_demonic_tyrant_smash', name: 'Yere Vuruş', kind: 'aoe', range: 3.4, radius: 3.4, cooldown: 2.4, hitTime: 0.6, anim: 'Punch', animSpeed: 1.0, coef: 1.2, type: 'physical', knockback: 1.5 },
    ],
    aggro: 14, follow: [3, 6], leash: 32,
    life: 15,
  },
];
