import { G } from '../game/G';
import type { CharacterSave, PetSave } from '../types/character';
import { PETS, PET_BY_ID, PET_EVENT_CHANCE, petForEvent, petItemId, type PetDef } from '../data/pets';
import { toast } from './notify';

/**
 * WP-12 cosmetic pets (docs/MMO_PILLARS.md). OWNER: panels-game / items (new system).
 *
 * Learning is once per pet and never shrinks (`save.pets.known`). One pet can be summoned at a time (`save.pets.active`),
 * it follows the local character (game/Pet.ts) and has no combat effect. The pure functions below work on a save only, so
 * the headless sim (dev/combat-sim/pets.mjs) can drive them. Wiring: `setPet()` (panel, summon / dismiss) emits `pet:changed`;
 * the teaching items are used through CharacterState.useConsumable; achievements teach through checkUnlocks (systems/Achievements.ts).
 */

/** The save's pet block, created on first use. */
export function petSave(save: CharacterSave): PetSave {
  const p = (save.pets ??= { known: [] });
  p.known ??= [];
  return p;
}

export function hasPet(save: CharacterSave, id: string): boolean {
  return !!PET_BY_ID[id] && (save.pets?.known ?? []).includes(id);
}

/** Learned pets, in catalogue order. */
export function knownPets(save: CharacterSave): PetDef[] {
  return PETS.filter((p) => hasPet(save, p.id));
}

/** Learns a pet. True when it is new; false for an unknown id or a pet already learned. */
export function learnPet(save: CharacterSave, id: string): boolean {
  if (!PET_BY_ID[id]) return false;
  const p = petSave(save);
  if (p.known.includes(id)) return false;
  p.known.push(id);
  return true;
}

/** The summoned pet's id, or null (none, or the saved one is no longer known). */
export function activePetId(save: CharacterSave): string | null {
  const id = save.pets?.active;
  return id && hasPet(save, id) ? id : null;
}

/** Summons a learned pet (replaces the current one). */
export function summonPet(save: CharacterSave, id: string): { ok: boolean; reason?: string } {
  if (!PET_BY_ID[id]) return { ok: false, reason: 'Bilinmeyen evcil hayvan.' };
  if (!hasPet(save, id)) return { ok: false, reason: 'Bu evcil hayvanı henüz öğrenmedin.' };
  petSave(save).active = id;
  return { ok: true };
}

/** Dismisses the summoned pet (the learned list is unchanged). */
export function dismissPet(save: CharacterSave): void {
  if (save.pets) delete save.pets.active;
}

/** A teaching item (`petItemId`) teaches its pet. Does not consume the item: the caller does (CharacterState.useConsumable). */
export function teachFromItem(save: CharacterSave, materialId: string): { ok: boolean; petId?: string; reason?: string } {
  const pet = PETS.find((p) => petItemId(p.id) === materialId);
  if (!pet) return { ok: false, reason: 'Bu bir evcil hayvan öğesi değil.' };
  if (!learnPet(save, pet.id)) return { ok: false, reason: `${pet.name} zaten sende.` };
  return { ok: true, petId: pet.id };
}

/** Event roll for one participant: the teaching item of the event's pet when `roll` < PET_EVENT_CHANCE, else null. */
export function eventPetItem(event: string, roll: number): string | null {
  const pet = petForEvent(event);
  return pet && roll < PET_EVENT_CHANCE ? petItemId(pet.id) : null;
}

// ---------------------------------------------------------------------------------------------- game wiring

/**
 * Summons the pet `id` of the local character, or dismisses the current one with null. Saves and emits `pet:changed`
 * (game/Pet.ts rebuilds the follower). False when not allowed (the reason is toasted).
 */
export function setPet(id: string | null): boolean {
  const ch = G.character;
  if (!ch) return false;
  if (id === null) dismissPet(ch.save);
  else {
    const r = summonPet(ch.save, id);
    if (!r.ok) {
      toast(r.reason ?? 'Evcil hayvan çağrılamadı.', 'warning');
      return false;
    }
  }
  ch.persist();
  G.events?.emit('pet:changed', { id: activePetId(ch.save) });
  return true;
}
