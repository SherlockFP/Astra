import type { UI } from '../UI';
import { div } from '../widgets/dom';
import type { MythicTracker } from './MythicTracker';
import type { QuestTracker } from './QuestTracker';

/**
 * UX-01 stub: the top-right tracker column (`.trk`). It temporarily holds the M+ tracker and the quest tracker one
 * above the other, exactly as they were direct children of `.hud-tr`. UX-12 turns it into the context tracker
 * (boss / run / quest / hint panes). The constructor signature is final.
 */
export class ContextTracker {
  readonly el: HTMLElement;

  constructor(_ui: UI, mythic: MythicTracker, quests: QuestTracker) {
    this.el = div('trk');
    this.el.append(mythic.el, quests.el);
  }
}
