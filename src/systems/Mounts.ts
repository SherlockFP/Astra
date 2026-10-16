import { G } from '../game/G';
import type { CharacterSave, MountSave } from '../types/character';
import { MOUNTS, MOUNT_BY_ID, mountItemId, type MountDef } from '../data/mounts';
import { toast } from './notify';

/**
 * Binek koleksiyonu (sprint2). Learning is once per mount and never shrinks (`save.mounts.known`). F9 summons the chosen mount
 * (`save.mounts.chosen`) when it is known; the favourites (`save.mounts.favs`) are the pool of the "Rastgele binek" button.
 * The pure functions work on a save only so the headless sim (dev/combat-sim/mounts.mjs) can drive them. Learned mounts are
 * per character (accounts do not exist in this build). Teaching items: a material with `teachesMount` (data/materials.ts).
 */

/** The save's mount block, created on first use. */
export function mountSave(save: CharacterSave): MountSave {
  const m = (save.mounts ??= { known: [] });
  m.known ??= [];
  m.favs ??= [];
  return m;
}

export function hasMount(save: CharacterSave, id: string): boolean {
  return !!MOUNT_BY_ID[id] && (save.mounts?.known ?? []).includes(id);
}

/** Learned mounts, in catalogue order. */
export function knownMounts(save: CharacterSave): MountDef[] {
  return MOUNTS.filter((m) => hasMount(save, m.id));
}

/** Learns a mount. True when it is new; false for an unknown id or a mount already learned. */
export function learnMount(save: CharacterSave, id: string): boolean {
  if (!MOUNT_BY_ID[id]) return false;
  const m = mountSave(save);
  if (m.known.includes(id)) return false;
  m.known.push(id);
  return true;
}

/** The mount F9 summons: the chosen one when it is still known, else the first learned one (null: none learned). */
export function chosenMountId(save: CharacterSave): string | null {
  const id = save.mounts?.chosen;
  if (id && hasMount(save, id)) return id;
  return knownMounts(save)[0]?.id ?? null;
}

/** Chooses the summoned mount. False when the mount is not learned (nothing changes). */
export function chooseMount(save: CharacterSave, id: string): boolean {
  if (!hasMount(save, id)) return false;
  mountSave(save).chosen = id;
  return true;
}

/** Adds or removes a favourite (learned mounts only). Returns the new state. */
export function toggleFavourite(save: CharacterSave, id: string): boolean {
  const m = mountSave(save);
  if (!hasMount(save, id)) return false;
  const i = m.favs!.indexOf(id);
  if (i >= 0) {
    m.favs!.splice(i, 1);
    return false;
  }
  m.favs!.push(id);
  return true;
}

export function isFavourite(save: CharacterSave, id: string): boolean {
  return (save.mounts?.favs ?? []).includes(id);
}

/** "Rastgele binek": a random pick among the favourites, else among all learned mounts. Null when none is learned. */
export function randomMount(save: CharacterSave, rnd: number = Math.random()): string | null {
  const favs = (save.mounts?.favs ?? []).filter((id) => hasMount(save, id));
  const pool = favs.length ? favs : knownMounts(save).map((m) => m.id);
  if (!pool.length) return null;
  return pool[Math.min(pool.length - 1, Math.floor(rnd * pool.length))];
}

/** A teaching item (`mountItemId`) teaches its mount. Does not consume the item: the caller does (CharacterState.useConsumable). */
export function teachFromMountItem(save: CharacterSave, materialId: string): { ok: boolean; mountId?: string; reason?: string } {
  const mount = MOUNTS.find((m) => mountItemId(m.id) === materialId);
  if (!mount) return { ok: false, reason: 'Bu bir binek öğesi değil.' };
  if (!learnMount(save, mount.id)) return { ok: false, reason: `${mount.name} zaten sende.` };
  // a fresh learner with nothing chosen summons the first one they learned
  if (!save.mounts?.chosen) mountSave(save).chosen = mount.id;
  return { ok: true, mountId: mount.id };
}

// ---------------------------------------------------------------------------------------------- game wiring

/** Chooses the mount F9 summons (panel). Saves and emits `mount:changed`. False when not learned (toasted). */
export function setChosenMount(id: string): boolean {
  const ch = G.character;
  if (!ch) return false;
  if (!chooseMount(ch.save, id)) {
    toast('Bu binek henüz öğrenilmedi.', 'warning');
    return false;
  }
  ch.persist();
  G.events?.emit('mount:changed', { id });
  return true;
}

/** Toggles a favourite (panel star). Saves and emits `mount:changed` with the id. */
export function setFavourite(id: string): boolean {
  const ch = G.character;
  if (!ch) return false;
  const on = toggleFavourite(ch.save, id);
  ch.persist();
  G.events?.emit('mount:changed', { id });
  return on;
}
