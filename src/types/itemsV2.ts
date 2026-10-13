// GDD_ITEMS_V2 Appendix A (IT-00): item power loop types. Core-owned, append-only for everyone.
// Types only. Behaviour belongs to items (systems/Upgrade, Stacks, Masterwork, Crafting, Quality, Tilsim) and to
// vfx/player (armor glow). Values and tables live in src/data/itemVisuals.ts and the src/data/*V2 files.
import type { ClassId, Rarity } from './common';
import type { EquipSlot, ItemInstance } from './items';

/** Slot order of every 6-array: helm, shoulders, chest, gloves, legs, boots. */
export type ArmorLevels = [number, number, number, number, number, number];
export interface ArmorLook {
  lv: ArmorLevels;                                   // per-slot upgrade level (0 = empty / broken / hidden)
  body: number;                                      // weighted average (chest x2), rounded half-up
  set: { id: string; count: number; total: number; color: number } | null;
  tint?: (number | null)[];                          // P2 base-tier tint per slot
}
export interface UpgLogEntry { t: number; name: string; from: number; to: number; res: 0 | 1 | 2 | 3 | 4 | 5; ch: number }   // res: stay, success, down, destroyed/broken, protected, pity
export interface UpgState { stacks: number; fails: number; wins: number; destroyStreak: number; best: number; log: UpgLogEntry[] }   // CharacterSave.upg
export interface QualityInfo { q: number; band: 0 | 1 | 2 | 3 | 4 | 5; bandName: string; seal: 0 | 1 | 2 | 3; lines: { id: string; q: number }[] }   // seal: none, Yıldız, Ay, Güneş
export interface PlusStyle { color: string; css: string; anim?: 'flame' | 'rainbow'; stars: number }
export interface ChatAnn { k: 'upg' | 'mw'; n: string; l: number; r: Rarity; c?: ClassId }                 // chat.ann
export interface CampState { rested: number; hearthAt: number }                                           // CharacterSave.camp
export interface HomeSave { tier: string; boughtAt: number; decor: number[][]; owned: Record<string, number>; trophies: Record<string, number>; stash: (ItemInstance | null)[]; mannequins: { slot: number; hide?: boolean }[]; bedRespawn: boolean }
export interface HomeSnapshot { tier: string; decor: number[][]; trophies: Record<string, number>; mannequins?: { cls: ClassId; v: number; g: Partial<Record<EquipSlot, ItemInstance>> }[] }
export type CampMsg = { o: number; k: 0 | 1; x: number; z: number; f: number } | { t: 'req' };            // NetChannels.camp
export type HomeMsg = { o: number; t: 'deco' | 'mq' | 'tro' | 'req'; tier?: string; p?: number[][]; mq?: HomeSnapshot['mannequins']; tr?: Record<string, number>; part?: [number, number] };   // NetChannels.home

/** IT-00 helper (not in Appendix A): shared result shape of the stub system functions (`{ ok: false, reason: 'Henüz yok.' }`). */
export interface OpResult { ok: boolean; reason?: string }
