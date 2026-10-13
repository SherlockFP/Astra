/**
 * OWNER: enemies module. Model URL builders for enemy defs (P-02).
 *
 * `MODEL` maps a model key to its shipped fallback and (later) final GLB. `M(key)` resolves it; `USE_FINAL_MODELS`
 * switches to the final entries once they exist. The table is not populated yet, so `M` returns the key unchanged.
 */
export const MODELS = '/assets/models/';
export const MON = (n: string) => `${MODELS}monsters/${n}.glb`;
export const CHAR = (n: string) => `${MODELS}characters/${n}.glb`;
export const SKEL = (n: string) => `${MODELS}enemies/${n}.glb`;
export const GEN = (n: string) => `${MODELS}gen/creatures/${n}.glb`;
export const GENB = (n: string) => `${MODELS}gen/bosses/${n}.glb`;
export const WPN = (n: string) => `${MODELS}weapons/skeleton/${n}.gltf`;
export const PROC = (n: string) => `PROC:${n}`;
export const ITCH = (n: string) => `${MODELS}itch/creatures/${n}.glb`;
export const PUG = `${MODELS}itch/bestiary/puglin.glb`;
export const GRAVE = (n: string) => `${MODELS}kenney/graveyard-kit/${n}.glb`;

/** P-02: one entry per model key. `final` is used only when USE_FINAL_MODELS is on and the GLB exists. */
export interface ModelEntry { fallback: string; final?: string }
export const USE_FINAL_MODELS = false;
export const MODEL: Record<string, ModelEntry> = {};
/** Resolves a model key to a URL; unregistered keys are returned unchanged (they are already URLs). */
export function M(key: string): string {
  const e = MODEL[key];
  if (!e) return key;
  return USE_FINAL_MODELS && e.final ? e.final : e.fallback;
}
