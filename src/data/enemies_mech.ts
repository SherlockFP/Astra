/**
 * Mechanic entity defs (P-20, package K13): procedural bodies from ai/procModels.ts, spawned by boss scripts with
 * spawnMech (and made invulnerable there where the mechanic needs it). Registered into ENEMIES by the MECH helper of
 * enemyKit.ts when this module is imported; enemies.ts must import it once so content-check and spawns see the ids.
 * Each id names its body in the `proc` argument, and BUILDERS in procModels.ts has that key.
 * OWNER: enemies module.
 */
import { MECH } from './enemyKit';

MECH('energy_orb', 'Enerji Küresi', 'energy_orb', 1, { radius: 0.8, speed: 4.5, visual: { hoverBob: 0.1 } });
MECH('proc_energy_orb', 'Enerji Küresi', 'energy_orb', 1, { radius: 0.8, speed: 4.5, visual: { hoverBob: 0.1 } });
MECH('eye_orb', 'Göz Küresi', 'eye_orb', 1, { radius: 0.6, speed: 4, visual: { hoverBob: 0.12 } });
MECH('proc_beacon', 'Işık Direği', 'beacon', 1, { radius: 0.9, ai: { stationary: true } });
MECH('proc_volatile_spike', 'Kararsız Sivri Taş', 'volatile_spike', 1, { radius: 0.6, ai: { stationary: true } });
MECH('proc_crystal_shard', 'Kristal Parçası', 'crystal_shard', 3, { radius: 1.0, visual: { blocker: 1.0 }, ai: { stationary: true } });
MECH('sinstone_shard', 'Sinstone Kıymığı', 'sinstone_shard', 4, { radius: 1.2, ai: { stationary: true } });
MECH('sinstone_statue', 'Günah Heykeli', 'sinstone_statue', 1, { radius: 1.4, speed: 5 });
MECH('parishioner', 'Hayalet Cemaat Üyesi', 'parishioner', 1, { radius: 0.7, speed: 5.8 });

/** Every id this module registers (smoke and content checks read it). */
export const MECH_IDS = [
  'energy_orb', 'proc_energy_orb', 'eye_orb', 'proc_beacon', 'proc_volatile_spike', 'proc_crystal_shard',
  'sinstone_shard', 'sinstone_statue', 'parishioner',
] as const;
