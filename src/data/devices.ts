// Dungeon devices (docs/dungeons/_shared_primitives.md P-14). `PropPlacement.tag: 'device'` + `PropPlacement.device: id` resolves here.
// Data only. Behaviour (host validation, broadcast, the gate or buff effect) lives in the dungeon device system, not in this file.
// Append-only: new devices are added as rows; new effects are added to `DeviceEffect` in the same change as their handler.
import type { StatusId } from '../types/skills';
import type { EntityId } from '../types/common';

/** `pulse` (Yankı Ağı): interrupts casts in `radius` and stuns non-elite, non-ccImmune enemies for `stunSec`. */
export type DeviceEffect = 'party_buff' | 'open_gate' | 'spawn_pack' | 'pulse';

export interface DeviceDef {
  id: string;
  /** Turkish interact prompt. */
  prompt: string;
  /** Interact range in metres. */
  range: number;
  /** One use per run. The prop goes dark after use. */
  once: boolean;
  effect: DeviceEffect;
  status?: StatusId;
  seconds?: number;
  radius?: number;
  /** `open_gate`: id of the `DoorDef` to open. */
  gateDoor?: string;
  /** VFX id played on use. */
  vfx?: string;
  /** `pulse`: cancel casts inside the radius. */
  interrupt?: boolean;
  /** `pulse`: stun length for non-elite, non-ccImmune enemies (seconds). */
  stunSec?: number;
}

export const DEVICES: Record<string, DeviceDef> = {
  echo_gong: { id: 'echo_gong', prompt: 'Çanı çal', range: 3, once: true, effect: 'pulse', radius: 14, interrupt: true, stunSec: 2, vfx: 'arcane_burst' },
  // Leş Uyanışı (docs/dungeons/les_uyanisi.md, section 3, devices): Gökbekçi Devi (Kyrian Goliath repair). One use per run each.
  // dev_gd1 and dev_gd3 wake the golem and give the party anima_exhaust (60 s, every player within 25 m).
  dev_gd1: { id: 'dev_gd1', prompt: "Gökbekçi Devi'ni uyandır", range: 3, once: true, effect: 'party_buff', status: 'anima_exhaust', seconds: 60, radius: 25, vfx: 'buff_aura' },
  dev_gd2: { id: 'dev_gd2', prompt: "Gökbekçi Devi'ni uyandır", range: 3, once: true, effect: 'open_gate', gateDoor: 'toll_kapisi|kisayol', status: 'anima_exhaust', seconds: 60, radius: 25, vfx: 'holy_burst' },
  dev_gd3: { id: 'dev_gd3', prompt: "Gökbekçi Devi'ni uyandır", range: 3, once: true, effect: 'party_buff', status: 'anima_exhaust', seconds: 60, radius: 25, vfx: 'buff_aura' },
};

export function deviceDef(id: string | undefined): DeviceDef | undefined {
  return id ? DEVICES[id] : undefined;
}

/**
 * Events the dungeon interactables emit (K9). The dungeon scene (host) subscribes through the `onEvent` option of each class and
 * applies the world effect (gate opening, pack alert, pack damage, cart rides). Plain data only.
 */
export type InteractEvent =
  | { type: 'npc'; npcId: string; byId: EntityId }
  | { type: 'boon'; boonId: string; byId: EntityId; status: StatusId; duration: number; persistOnDeath: boolean }
  | { type: 'station'; stationId: string; byId: EntityId; buff: StatusId; duration: number }
  | { type: 'gate'; gateId: string; byId: EntityId; x: number; z: number }
  | { type: 'gate:cancel'; gateId: string; byId: EntityId }
  | { type: 'transit'; transitId: string; phase: 'start' | 'arrive'; riderIds: EntityId[]; to: [number, number]; seconds: number }
  | { type: 'drop'; propId: string; byId: EntityId; x: number; z: number };

/** Turkish profession names for requirement prompts ("Gereken: Demirci"). */
export const PROFESSION_NAMES: Record<string, string> = {
  wood: 'Oduncu', mine: 'Madenci', herb: 'Otacı', skin: 'Derici', fish: 'Balıkçı', smith: 'Demirci', alch: 'Simyacı',
  leather: 'Deri İşçisi', tailor: 'Terzi', jewel: 'Kuyumcu', cook: 'Aşçı',
};
