import type { UI } from '../../UI';
import '../../styles/panels-items.css';
import { registry, type ItemPanel } from './PanelBase';
import { InventoryPanel } from './InventoryPanel';
import { CharacterPanel } from './CharacterPanel';
import { StashPanel } from './StashPanel';
import { VendorPanel } from './VendorPanel';
import { BlacksmithPanel } from './BlacksmithPanel';
import { SkillsPanel } from './SkillsPanel';

const done = new WeakSet<UI>();

/**
 * OWNER: panels-items module.
 * Registers inventory, character (3D preview), stash, vendor (merchant/alchemist), blacksmith (+N, efsun, sockets) and the skill book.
 * Safe to call more than once for the same UI instance.
 */
export function registerItemPanels(ui: UI): void {
  if (done.has(ui)) return;
  done.add(ui);
  const panels: ItemPanel[] = [new InventoryPanel(), new CharacterPanel(), new StashPanel(), new VendorPanel(), new BlacksmithPanel(), new SkillsPanel()];
  for (const p of panels) {
    ui.registerPanel(p);
    registry[p.id] = p;
    // panels mount themselves into the UI root if the UI did not adopt the element
    if (!p.el.isConnected && ui.root) ui.root.appendChild(p.el);
  }
}

/** The panel instances by id (dev pages / cross-module access). Empty until registerItemPanels ran. */
export const itemPanels = registry;
