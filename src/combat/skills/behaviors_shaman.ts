/**
 * CLASS SCAFFOLD: Şaman behaviours (BEHAVIORS_SHAMAN). Installed into BEHAVIORS by the import at the end of behaviors.ts, with the
 * same microtask fallback as behaviors_monk.ts (the module can load before BEHAVIORS is initialised). Empty until the shaman kit
 * lands. OWNER: shaman kit.
 */
import { BEHAVIORS, type Behavior } from './behaviors';

export const BEHAVIORS_SHAMAN: Record<string, Behavior> = {};

function installShaman(): void {
  Object.assign(BEHAVIORS, BEHAVIORS_SHAMAN);
}

try {
  installShaman();
} catch {
  queueMicrotask(installShaman);
}
