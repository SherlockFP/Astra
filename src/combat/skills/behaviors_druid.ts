/**
 * CLASS SCAFFOLD: Druid behaviours (BEHAVIORS_DRUID). Installed into BEHAVIORS by the import at the end of behaviors.ts, with the
 * same microtask fallback as behaviors_monk.ts (the module can load before BEHAVIORS is initialised). Empty until the druid kit
 * lands. OWNER: druid kit.
 */
import { BEHAVIORS, type Behavior } from './behaviors';

export const BEHAVIORS_DRUID: Record<string, Behavior> = {};

function installDruid(): void {
  Object.assign(BEHAVIORS, BEHAVIORS_DRUID);
}

try {
  installDruid();
} catch {
  queueMicrotask(installDruid);
}
