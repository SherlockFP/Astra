/**
 * SHAMAN minions (Şaman kit). Stationary totems (speed 0, they never follow or leave their spot; `life` is set by the summon row)
 * and the Ruh Kurdu spirit wolves (group `pack`, cap 2, life 15 s). Registered by the aggregator in data/minions.ts.
 * Totems use the `lesser` group (cap 3 per owner). The healing totems have no attacks: their heal is the stream behaviour.
 */
import type { MinionDef } from '../../types/minions';

const WOLF_MODEL = '/assets/models/itch/creatures/wolf.glb';
const TOTEM_MODEL = '/assets/models/enemies/Skeleton_Minion.glb';
const TOTEM_ANIMS = { idle: 'Idle', walk: 'Walk', run: 'Run', hit: 'Hit', death: 'Death', spawn: 'GetUp' };
const WOLF_ANIMS = { idle: 'Idle', walk: 'Walk', run: 'Run', hit: 'Hit', death: 'Death', spawn: 'GetUp' };

export const SHAMAN_MINIONS: MinionDef[] = [
  {
    // Ateş Totemi (shaman_totem_fire): pulses fire on enemies within 8 m
    id: 'shaman_fire_totem', name: 'Ateş Totemi', ownerClass: 'shaman', role: 'caster', group: 'lesser',
    model: TOTEM_MODEL, scale: 0.9, tint: 0xff5a20, emissive: 0x602000,
    anims: TOTEM_ANIMS, radius: 0.5, height: 2.0, speed: 0,
    hpFrac: 0.3, armorFrac: 0.2,
    attacks: [
      { id: 'shaman_fire_totem_pulse', name: 'Ateş Dalgası', kind: 'aoe', range: 8, radius: 3.5, cooldown: 2.0, hitTime: 0.6, anim: 'Spellcast_Shoot', animSpeed: 1.0, coef: 0.7, type: 'fire' },
    ],
    aggro: 14, follow: [0, 0], leash: 30,
  },
  {
    // Toprak Bağlama Totemi (shaman_totem_earthbind): roots enemies within 8 m for 2 s
    id: 'shaman_earthbind_totem', name: 'Toprak Bağlama Totemi', ownerClass: 'shaman', role: 'caster', group: 'lesser',
    model: TOTEM_MODEL, scale: 0.9, tint: 0x8a6a3a,
    anims: TOTEM_ANIMS, radius: 0.5, height: 2.0, speed: 0,
    hpFrac: 0.3, armorFrac: 0.2,
    attacks: [
      { id: 'shaman_earthbind_pulse', name: 'Toprak Bağı', kind: 'aoe', range: 8, radius: 4, cooldown: 4, hitTime: 0.6, anim: 'Spellcast_Raise', animSpeed: 1.0, coef: 0.2, type: 'physical', statuses: [{ status: 'root', duration: 2 }] },
    ],
    aggro: 12, follow: [0, 0], leash: 30,
  },
  {
    // Şifa Akıntısı Totemi (shaman_stream_totem): no attacks; its HoT is the stream behaviour
    id: 'shaman_stream_totem', name: 'Şifa Akıntısı Totemi', ownerClass: 'shaman', role: 'caster', group: 'lesser',
    model: TOTEM_MODEL, scale: 0.9, tint: 0x5ad08a,
    anims: TOTEM_ANIMS, radius: 0.5, height: 2.0, speed: 0,
    hpFrac: 0.3, armorFrac: 0.2,
    attacks: [],
    aggro: 0, follow: [0, 0], leash: 30,
  },
  {
    // Gelgit Totemi (shaman_tide_totem, m90): the larger healing totem, same stream behaviour
    id: 'shaman_tide_totem', name: 'Gelgit Totemi', ownerClass: 'shaman', role: 'caster', group: 'lesser',
    model: TOTEM_MODEL, scale: 1.1, tint: 0x3aa0ff, emissive: 0x104060,
    anims: TOTEM_ANIMS, radius: 0.6, height: 2.4, speed: 0,
    hpFrac: 0.4, armorFrac: 0.3,
    attacks: [],
    aggro: 0, follow: [0, 0], leash: 30,
  },
  {
    // Ruh Kurdu (shaman_feral_spirit): a fast melee wolf, 15 s, group pack (cap 2)
    id: 'shaman_spirit_wolf', name: 'Ruh Kurdu', ownerClass: 'shaman', role: 'beast', group: 'pack',
    model: WOLF_MODEL, scale: 0.9, tint: 0xbfd7ff, ghost: 0.7,
    anims: WOLF_ANIMS, radius: 0.5, height: 1.0, speed: 7.0,
    hpFrac: 0.35, armorFrac: 0.1,
    attacks: [
      { id: 'shaman_spirit_wolf_bite', name: 'Ruh Isırığı', kind: 'melee', range: 2.2, cooldown: 1.4, hitTime: 0.35, anim: 'Attack', animSpeed: 1.2, coef: 0.9, type: 'physical' },
    ],
    aggro: 12, follow: [2, 4], leash: 25,
    life: 15,
  },
];
