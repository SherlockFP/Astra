/**
 * Paladin behaviours (GDD_CLASSES_V2 §14 NC51). NC48 creates this file empty; the paladin package fills BEHAVIORS_PALADIN
 * and never touches behaviors.ts. Installed into BEHAVIORS by the import at the end of behaviors.ts (microtask fallback, as in plateKit.ts).
 */
import { BEHAVIORS, type Behavior } from './behaviors';

export const BEHAVIORS_PALADIN: Record<string, Behavior> = {};

function installPaladin(): void {
  Object.assign(BEHAVIORS, BEHAVIORS_PALADIN);
}

try {
  installPaladin();
} catch {
  queueMicrotask(installPaladin);
}
