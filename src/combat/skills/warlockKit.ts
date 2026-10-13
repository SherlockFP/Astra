/**
 * KIT PK-0 scaffold (docs/kits/casters-rogue.md §h PK-WARLOCK). Behaviours of the warlock kit (spectral_summon, dot_pulse, Seed
 * detonation, fragment hooks). Empty until PK-WARLOCK. Installed into BEHAVIORS as a side effect of the import at the end of
 * behaviors.ts; the microtask fallback follows the same pattern as utilities.ts (see mageKit.ts).
 */
import { BEHAVIORS, type Behavior } from './behaviors';

export const BEHAVIORS_KIT_WARLOCK: Record<string, Behavior> = {};

function installKitWarlock(): void {
  Object.assign(BEHAVIORS, BEHAVIORS_KIT_WARLOCK);
}

try {
  installKitWarlock();
} catch {
  queueMicrotask(installKitWarlock);
}
