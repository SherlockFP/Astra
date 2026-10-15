/**
 * Input gating rules (WoW). DOM-free and import-free so tools/controls-check.mjs can test them headless.
 *
 * Open windows (bags, character, quest log, spellbook, the NPC talk window) never stop movement, F interact or mouse-look.
 * Only a text field (chat, search), the menu / loading screens, the HUD layout editor and a modal confirm box do.
 * A talk window (gossip, quest, vendor) closes when the player walks further than NPC_TETHER_RANGE from its NPC.
 */

/** Distance (m, ground plane) beyond which the NPC talk window closes (WoW: "too far away"). */
export const NPC_TETHER_RANGE = 6;

/** True for an element that takes typed text: an input, a textarea or a contenteditable node. */
export function isTextTarget(t: unknown): boolean {
  const el = t as { tagName?: string; isContentEditable?: boolean } | null;
  if (!el || !el.tagName) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || !!el.isContentEditable;
}

export interface KeysGateState {
  /** UI mode; 'menu' and 'loading' have no game under them. */
  uiMode: string;
  /** HUD layout editor open (mouse driven). */
  editing: boolean;
  /** A modal confirm box is open. */
  modal: boolean;
  /** The chat input has the focus. */
  chatFocused: boolean;
  /** A text field has the focus (document.activeElement). */
  textFocused: boolean;
  /** Open windows. Counted for the record only: they never block the game keys. */
  panelsOpen: number;
  /** The game menu (Esc) is open. Blocks skill casting and potions, not movement. */
  gameMenuOpen?: boolean;
}

/** True when the keyboard game actions (movement, F interact) must be ignored. Open windows do not block them. */
export function keysBlocked(s: KeysGateState): boolean {
  if (s.uiMode === 'menu' || s.uiMode === 'loading') return true;
  return s.editing || s.modal || s.chatFocused || s.textFocused;
}

/**
 * True when the skill and potion keys (ActionBar hotkeys, PlayerController casting) must be ignored. WoW: abilities cast with the
 * bags, character or quest log open; the same rules as movement apply, plus the game menu.
 */
export function skillKeysBlocked(s: KeysGateState): boolean {
  return keysBlocked(s) || !!s.gameMenuOpen;
}

/** True when the player is farther than `range` from the NPC (ground plane). */
export function npcTooFar(player: { x: number; z: number }, npc: { x: number; z: number }, range = NPC_TETHER_RANGE): boolean {
  return Math.hypot(npc.x - player.x, npc.z - player.z) > range;
}
