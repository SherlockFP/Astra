/**
 * CLASS SCAFFOLD: Rahip behaviours (BEHAVIORS_PRIEST). Installed into BEHAVIORS by the import at the end of behaviors.ts, with the
 * same microtask fallback as behaviors_monk.ts (the module can load before BEHAVIORS is initialised). Empty until the priest kit
 * lands. OWNER: priest kit.
 */
import { BEHAVIORS, type Behavior } from './behaviors';

export const BEHAVIORS_PRIEST: Record<string, Behavior> = {};

function installPriest(): void {
  Object.assign(BEHAVIORS, BEHAVIORS_PRIEST);
}

try {
  installPriest();
} catch {
  queueMicrotask(installPriest);
}
