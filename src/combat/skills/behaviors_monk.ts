/**
 * Keşiş behaviours (GDD_CLASSES_V2 §14 NC49). NC48 creates this file empty; the monk package fills BEHAVIORS_MONK
 * and never touches behaviors.ts. Installed into BEHAVIORS by the import at the end of behaviors.ts (microtask fallback, as in plateKit.ts).
 */
import { BEHAVIORS, type Behavior } from './behaviors';

export const BEHAVIORS_MONK: Record<string, Behavior> = {};

function installMonk(): void {
  Object.assign(BEHAVIORS, BEHAVIORS_MONK);
}

try {
  installMonk();
} catch {
  queueMicrotask(installMonk);
}
