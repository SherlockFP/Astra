import type { CharLodPlan } from '../world/WorldPerf';

/**
 * Render LOD of the characters (town NPCs, entities/NPC.ts). PURE and DOM-free: the node sims import it, and the NPC applies the same
 * rules per frame. Tiers by the distance from the local player, the view and the ambient cap of the quality (WorldPerf.charLodPlan):
 *   full       closer than plan.full: the whole model, its attachments and its blob shadow, casts shadows, mixer every frame
 *   mid        plan.full up to plan.model: the body only (attachments and blob shadow hidden), no shadow, mixer at plan.mixerHz
 *   billboard  plan.model up to plan.hide, or beyond the plan.maxDrawn nearest models in view: one textured quad (1 draw call)
 *   hidden     beyond plan.hide, or outside the view
 * Exempt characters (the NPC the local player can talk to, within interact range) are never billboarded or hidden.
 * Skinned meshes are never frustum culled, so a visible model costs its draw in every pass, wherever it stands in the view.
 */
export type CharTier = 'full' | 'mid' | 'billboard' | 'hidden';

/**
 * KayKit accessory nodes (weapons, shields, helmets, capes, props). setAccessories shows the ones an NPC wears; the mid tier hides all of
 * them. Kept here (the pure module) so the budget sim measures the same set as the game.
 */
export const CHARACTER_ACCESSORY_NODES: readonly string[] = [
  '1H_Sword', '2H_Sword', 'Round_Shield', 'Badge_Shield', 'Rectangle_Shield', 'Spike_Shield', '1H_Sword_Offhand', 'Knight_Helmet', 'Knight_Cape',
  '2H_Axe', '1H_Axe', 'Mug', '1H_Axe_Offhand', 'Barbarian_Round_Shield', 'Barbarian_Hat', 'Barbarian_Cape',
  '2H_Staff', '1H_Wand', 'Spellbook', 'Spellbook_open', 'Mage_Hat', 'Mage_Cape',
  'Knife', 'Knife_Offhand', 'Rogue_Cape', '1H_Crossbow', '2H_Crossbow', 'Throwable',
];

/** What the tier rule reads from a character: its distance (m), whether its view sphere is on screen, and whether it is exempt. */
export interface CharLodSource {
  lodDist: number;
  lodSeen: boolean;
  lodExempt: boolean;
}

/** Live characters that take part in the cap (registered by NPC.onAdded, removed by its onRemoved). */
const registry = new Set<CharLodSource>();

/** Adds a character to the cap registry. Returns the function that removes it again. */
export function registerCharLod(s: CharLodSource): () => void {
  registry.add(s);
  return () => registry.delete(s);
}

/** Number of seen, non-exempt registered characters nearer than `self` (the ones that take its place in the cap). */
export function nearerCount(self: CharLodSource): number {
  let n = 0;
  for (const o of registry) if (o !== self && o.lodSeen && !o.lodExempt && o.lodDist < self.lodDist) n++;
  return n;
}

/**
 * The tier of one character. `nearer` is the number of seen ambient characters nearer than it (nearerCount, or the same count taken
 * from a sorted list in the sim). Exempt characters ignore the view and the cap.
 */
export function tierFor(dist: number, seen: boolean, exempt: boolean, nearer: number, plan: CharLodPlan): CharTier {
  if (exempt) return dist < plan.full ? 'full' : 'mid';
  if (!seen || dist >= plan.hide) return 'hidden';
  if (dist >= plan.model || nearer >= plan.maxDrawn) return 'billboard';
  return dist < plan.full ? 'full' : 'mid';
}
