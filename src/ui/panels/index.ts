import type { UI } from '../UI';
import { registerItemPanels } from './items';
import { registerGamePanels } from './game';
import '../styles/panels-talents-shell.css';
import '../styles/panels-talents-tree.css';
import '../styles/panels-talents-web.css';
import '../styles/panels-talents-skills.css';
import '../styles/panels-talents-dialogs.css';

/**
 * Registers every panel. Split across two owners:
 *  - panels-items (src/ui/panels/items/*): inventory, character, stash, vendor/alchemist, blacksmith (upgrade/efsun/sockets), skills book
 *  - panels-game  (src/ui/panels/game/*): talents tree, keystone/Font of Power, run summary, M+ info & vault, settings,
 *    party/server browser, map, death, game menu (Esc), bounty board, trainer
 * Panel ids are listed in ARCHITECTURE.md ("Panels").
 */
export function registerPanels(ui: UI): void {
  registerItemPanels(ui);
  registerGamePanels(ui);
}
