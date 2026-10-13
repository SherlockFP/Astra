/**
 * Okçu behaviours (GDD_CLASSES_V2 §14 NC50). NC48 creates this file empty; the archer package fills BEHAVIORS_ARCHER
 * and never touches behaviors.ts. Installed into BEHAVIORS by the import at the end of behaviors.ts (microtask fallback, as in plateKit.ts).
 */
import { BEHAVIORS, type Behavior } from './behaviors';

export const BEHAVIORS_ARCHER: Record<string, Behavior> = {};

function installArcher(): void {
  Object.assign(BEHAVIORS, BEHAVIORS_ARCHER);
}

try {
  installArcher();
} catch {
  queueMicrotask(installArcher);
}
