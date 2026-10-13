/**
 * UX-12 dev hooks for the context tracker (dev only). Wire them from dev/hud.ts; nothing in the game calls them.
 * - `pinTrackerMode('boss' | 'run' | 'quest')` clicks that header tab (pins the mode for 60 s). The hint pane has no tab:
 *   it shows whenever nothing else is on screen. Boss mode needs the boss frame (the dev page's boss key).
 * - `advanceKillDev()` runs the dev page's quest step (Numpad4), which moves the kill bar and the quest feed.
 * OWNER: hud module.
 */

export function pinTrackerMode(mode: 'boss' | 'run' | 'quest'): boolean {
  const tab = document.querySelector<HTMLButtonElement>(`.trk-tab[data-mode="${mode}"]`);
  if (!tab) return false;
  tab.click();
  return true;
}

export function advanceKillDev(): void {
  (window as unknown as { dev?: { questStep?: () => void } }).dev?.questStep?.();
}
