import type { Player } from './Player';

/**
 * Anything the local player can use with the interact key (F): NPCs, portals, chests, keystone pedestal,
 * loot (optional), doors, bounty board. Entities of kind 'npc' | 'interactable' (and 'loot') implement this;
 * PlayerController finds the nearest one in range and shows `interactPrompt` via 'interact:prompt'.
 * OWNER: scenes module (NPC.ts / concrete interactables); this interface is a shared contract.
 */
export interface Interactable {
  readonly interactPrompt: string;      // Turkish, e.g. "Demirci Hüseyin ile konuş"
  readonly interactRange: number;       // units
  canInteract?(player: Player): boolean;
  interact(player: Player): void;
  // GDD_LIFE §1.6 (L-00, optional): hold-F interaction. holdSeconds > 0 means "hold F for this long" instead of a press.
  /** Hold duration in seconds (> 0 enables the hold path in PlayerController.updateInteract). */
  holdSeconds?: number;
  /** Called once when the hold starts; return false to refuse (the node toasts the reason). */
  holdStart?(player: Player): boolean;
  /** Per frame while holding; t01 = progress 0..1. */
  holdTick?(player: Player, t01: number, dt: number): void;
  /** Hold cancelled before completion (no cost). */
  holdCancel?(player: Player, t01: number): void;
  /** HUD label and bar colour, e.g. { label: 'Meşe Ağacı kesiliyor', color: '#c8a070', tag: 'Zor' }. */
  holdInfo?(player: Player): { label: string; color: string; tag?: string; tagColor?: string };
}

export function isInteractable(e: unknown): e is Interactable {
  return !!e && typeof (e as Interactable).interact === 'function' && typeof (e as Interactable).interactRange === 'number';
}
