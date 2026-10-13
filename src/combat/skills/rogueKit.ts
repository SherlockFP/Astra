/**
 * KIT PK-0 scaffold (docs/kits/casters-rogue.md §h PK-ROGUE). Behaviours of the rogue kit (finisher, shadow_step v2, Simya Bağı
 * hooks). Empty until PK-ROGUE. Installed into BEHAVIORS as a side effect of the import at the end of behaviors.ts; the
 * microtask fallback follows the same pattern as utilities.ts (see mageKit.ts).
 */
import { BEHAVIORS, type Behavior } from './behaviors';

export const BEHAVIORS_KIT_ROGUE: Record<string, Behavior> = {};

function installKitRogue(): void {
  Object.assign(BEHAVIORS, BEHAVIORS_KIT_ROGUE);
}

try {
  installKitRogue();
} catch {
  queueMicrotask(installKitRogue);
}
