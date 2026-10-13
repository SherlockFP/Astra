/**
 * KIT PK-0 scaffold (docs/kits/casters-rogue.md §h PK-MAGE). Behaviours of the mage kit (homing_missiles, ignite_spread,
 * comet_storm, Touch / Surge / Barrier). Empty until PK-MAGE. Installed into BEHAVIORS as a side effect of the import at the end
 * of behaviors.ts; the module cycle can leave BEHAVIORS in its temporal dead zone, so installation falls back to a microtask
 * (the same pattern as utilities.ts).
 */
import { BEHAVIORS, type Behavior } from './behaviors';

export const BEHAVIORS_KIT_MAGE: Record<string, Behavior> = {};

function installKitMage(): void {
  Object.assign(BEHAVIORS, BEHAVIORS_KIT_MAGE);
}

try {
  installKitMage();
} catch {
  queueMicrotask(installKitMage);
}
