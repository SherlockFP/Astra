// GDD_LIFE §1.2 (L-00): gathering and crafting data shapes. Core-owned, append-only.
// Types only. Behaviour: systems/Professions.ts (items), data/professions.ts, data/gatherNodes.ts, data/recipes.ts.
import type { ItemCategory } from './items';
import type { Rarity } from './common';

export type ProfessionId = 'wood'|'mine'|'herb'|'skin'|'fish'|'smith'|'alch'|'leather'|'tailor'|'jewel'|'cook';
export type StationId = 'forge'|'alchemy'|'workbench'|'cookfire';
export type ToolKind = 'axe'|'pick'|'sickle'|'knife'|'rod';

export interface ProfessionDef {
  id: ProfessionId; name: string; subtitle?: string; kind: 'gather'|'craft';
  icon: string;                 // /assets/icons/*.svg (mapping in §1.9)
  color: string;                // accent, §0.3
  toolKind?: ToolKind; stations?: StationId[]; trainerNpc: string; desc: string;
}
export interface ProfessionSave { skill: number; tier: number }           // CharacterSave.professions?: Partial<Record<ProfessionId, ProfessionSave>>

export interface NodeTypeDef {
  id: string; name: string; prof: ProfessionId; tier: number;             // tier 1..6
  skillReq: number;             // min skill; orange band starts here
  model: string; scale: number; tint?: number; emissive?: number;
  depletedModel?: string; depletedScale?: number;
  gatherSec: number;            // base hold time at tool tier == node tier
  strikes: number;              // tool impacts during the hold (0 for herbs)
  respawnSec: number;           // personal respawn (PvE) / host respawn (shared nodes)
  yields: { id: string; min: number; max: number; chance?: number }[];   // chance default 1
  rare?: { id: string; chance: number; min?: number; max?: number; gold?: number }[];
  nodeLevel: number;            // for XP (xpMonster(nodeLevel))
  anim: 'chop'|'mine'|'pick'|'skin'|'fish';
}
export interface ToolDef { id: string; kind: ToolKind; tier: number; name: string; speedMult: number; rareBonus: number; yieldBonus: number; model: string }
export interface RecipeDef {
  id: string; prof: ProfessionId; station: StationId; tier: number; skillReq: number; name: string;
  inputs: { id: string; count: number }[];
  output: { id: string; count: number } | { gen: { category: ItemCategory | 'amulet' | 'ring'; ilvl: number; rarity: Rarity; forced?: string[] } };
  catalyst?: 'essence' | 'gem';          // optional extra input slot in the panel
  timeSec: number;                       // craft bar per item
  learn: 'auto' | string;                // 'auto' = known with the tier, else the id of the Tarif scroll
  gold?: number;                         // Zanaat ücreti (gold sink)
  xpMult?: number;
}
export interface SkinDef { tier: number; reqSkill: number; hide: string; meat?: boolean; rare?: { id: string; chance: number }[] }
