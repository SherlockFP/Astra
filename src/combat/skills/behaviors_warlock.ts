/**
 * Warlock behaviours (GDD_CLASSES_V2 §14 NC53). NC48 creates this file empty; the warlock package fills BEHAVIORS_WARLOCK
 * and never touches behaviors.ts. Installed into BEHAVIORS by the import at the end of behaviors.ts (microtask fallback, as in plateKit.ts).
 */
import { BEHAVIORS, type Behavior } from './behaviors';

export const BEHAVIORS_WARLOCK: Record<string, Behavior> = {};

function installWarlock(): void {
  Object.assign(BEHAVIORS, BEHAVIORS_WARLOCK);
}

try {
  installWarlock();
} catch {
  queueMicrotask(installWarlock);
}
