/**
 * Nekromant behaviours (GDD_CLASSES_V2 §14 NC52). NC48 creates this file empty; the necromancer package fills BEHAVIORS_NECROMANCER
 * and never touches behaviors.ts. Installed into BEHAVIORS by the import at the end of behaviors.ts (microtask fallback, as in plateKit.ts).
 */
import { BEHAVIORS, type Behavior } from './behaviors';

export const BEHAVIORS_NECROMANCER: Record<string, Behavior> = {};

function installNecromancer(): void {
  Object.assign(BEHAVIORS, BEHAVIORS_NECROMANCER);
}

try {
  installNecromancer();
} catch {
  queueMicrotask(installNecromancer);
}
