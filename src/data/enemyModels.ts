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

/**
 * Body size of the humanoid and big-creature models (owner brief, 2026-10-16: the player is a 1.8 m human; humanoid enemies stand
 * 1.7 to 2.0 m, big creatures and bosses clearly taller). `native` is the GLB rest height in metres (glbtris bind bounds, headgear
 * included, measured with dev/combat-sim); `target` is the standing height the model is shown at. An entry sets the body scale of
 * its model to target / native in place of the def.scale of the enemy data. Rank factors (elite, miniboss, boss arena) still apply.
 * Models not listed keep their def.scale (flyers, spiders, rats, slimes, procedural bodies, ...).
 */
export interface HumanoidBody { native: number; target: number }
export const HUMANOID_BODY: Record<string, HumanoidBody> = {
  [SKEL('Skeleton_Minion')]: { native: 2.17, target: 1.85 },
  [SKEL('Skeleton_Warrior')]: { native: 2.59, target: 1.85 },
  [SKEL('Skeleton_Rogue')]: { native: 2.31, target: 1.85 },
  [SKEL('Skeleton_Mage')]: { native: 2.63, target: 1.85 },
  [CHAR('Knight')]: { native: 2.47, target: 1.85 },
  [CHAR('Barbarian')]: { native: 2.40, target: 1.85 },
  [CHAR('Mage')]: { native: 3.00, target: 1.9 },
  [CHAR('Rogue')]: { native: 2.19, target: 1.8 },
  [CHAR('Rogue_Hooded')]: { native: 2.25, target: 1.8 },
  [MON('Zombie')]: { native: 2.79, target: 1.8 },
  [MON('Demon')]: { native: 2.74, target: 2.1 },
  [MON('Orc')]: { native: 3.21, target: 2.3 },
  [MON('Goblin')]: { native: 3.00, target: 1.5 },
  [MON('Yeti')]: { native: 3.16, target: 2.8 },
  [MON('Giant')]: { native: 3.95, target: 3.6 },
  [MON('Mushroom_King')]: { native: 3.61, target: 3.0 },
  [MON('Blue_Demon')]: { native: 2.84, target: 3.2 },
  [MON('Demon_Lord')]: { native: 3.12, target: 3.4 },
};

/** Body scale of an enemy model from HUMANOID_BODY (target / native), or null when the model is not listed (use def.scale). */
export function humanoidBodyScale(model: string): number | null {
  const e = HUMANOID_BODY[model];
  return e ? e.target / e.native : null;
}
